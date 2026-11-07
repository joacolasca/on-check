// Lectura del estado del fondo a partir de los eventos y de las lecturas del contrato. Montos en pesos como string decimal.
import { formatEther, type Address, type Hex, type PublicClient } from "viem";
import { formatBps, formatPesos, hashCorto, unidadesADecimal, urlTx } from "@/lib/format";
import { bandaDe } from "@/lib/scoring/puntaje";
import { TIPOS_GARANTIA } from "@/shared/types";
import type { ChequeVista, Composicion, CuentaDemo, CuentaDemoEstado, EstadoCheque, PoliticaFondo, PosicionInversor, RescateVista, ResumenFondo, RolCuentaDemo, TipoActivo, TipoGarantia } from "@/shared/types";
import { ABI_ARGT, ABI_FONDO } from "./abi";
import { clienteSepolia, direccionDe } from "./clientes";
import type { ConfigChain } from "./config";
import { componer, emisoresConocidos, etiquetaEmisor, nombreEmisor } from "./composicion";
import { obtenerExplicacion } from "./cotizaciones";
import { nombreIndustria } from "./industrias";
import { POLITICA_POR_DEFECTO } from "./politica";

const UN_TOKEN = 10n ** 18n;
const VENTANA_LOGS = 9_000n;
const CONCURRENCIA_LOGS = 3;
const NOMBRES_EVENTOS = ["ChequeRegistrado", "ChequeFondeado", "ChequePagado", "ChequeRechazado", "RescateSolicitado", "RescateLiquidado", "RescateCancelado"];

export interface ChequeCadena {
  id: Hex;
  libradorHash: Hex;
  pyme: Address;
  nominal: bigint;
  precioCompra: bigint;
  vencimiento: bigint;
  puntaje: number;
  tasaBps: number;
  cotizacionHash: Hex;
  tipo: TipoActivo;
  industria: number; // id de shared/industrias.json
  tipoGarantia: TipoGarantia;
  coberturaBps: number;
  garantiaHash: Hex;
  estado: EstadoCheque;
  txs: { tipo: string; hash: Hex }[];
  bloqueFondeo?: bigint;
}

export interface EstadoCadena {
  cheques: ChequeCadena[];
  totalAssets: bigint;
  liquidez: bigint;
  valorCuotaparte: bigint;
  exposicion: Map<string, bigint>; // libradorHash → ARGt comprado hoy (cheques Funded)
  exposicionIndustria: Map<number, bigint>; // id de industria → ARGt comprado hoy
  rescates: RescateVista[];
  resumen: ResumenFondo;
  bloque: bigint; // bloque contra el que se leyó todo
}

interface LogDecodificado {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
}

// --- Lecturas ancladas a un bloque -------------------------------------------------------------
// Infura reparte los pedidos entre nodos y uno puede ir atrasado: después de escribir, se exige un bloque mínimo
// (el del recibo) y todas las lecturas de un cálculo se hacen contra el mismo bloque.
export const ajustesLectura = { reintentos: 4, esperaMs: 750 };
let ultimoBloqueEscrito = 0n;

/** Anota el bloque de un recibo de esta instancia: piso para las lecturas siguientes. */
export function registrarBloqueEscrito(bloque: bigint): void {
  if (bloque > ultimoBloqueEscrito) ultimoBloqueEscrito = bloque;
}
export const bloqueEscrito = (): bigint => ultimoBloqueEscrito;
// El bloque mínimo de la cookie lo manda el cliente: uno "del futuro" (más de MARGEN_BLOQUES por encima del último bloque
// visto) se ignora, para que una cookie manipulada no fuerce esperas ni saltee la caché.
export const MARGEN_BLOQUES = 30n; // ~1 min en Base (un bloque cada 2 s)
let ultimoBloqueVisto = 0n;
const pisoDe = (minBloque?: bigint): bigint => {
  const creible = minBloque !== undefined && (ultimoBloqueVisto === 0n || minBloque <= ultimoBloqueVisto + MARGEN_BLOQUES);
  return minBloque !== undefined && creible && minBloque > ultimoBloqueEscrito ? minBloque : ultimoBloqueEscrito;
};

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const BLOQUE_FALTANTE = /header not found|unknown block|block not found|missing trie node|block #?\d+ not found|height is not available/i;

/** El nodo no tiene todavía el bloque pedido (está atrasado). */
export function esBloqueFaltante(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && typeof x === "object" && i < 6; i++) {
    const o = x as { message?: unknown; details?: unknown; cause?: unknown };
    if ((typeof o.message === "string" && BLOQUE_FALTANTE.test(o.message)) || (typeof o.details === "string" && BLOQUE_FALTANTE.test(o.details))) return true;
    x = o.cause;
  }
  return false;
}

/** Ejecuta `f` anclado a un bloque `hasta >= minBloque`. Reintenta si el nodo va atrasado; si no se recupera, sigue con lo que hay (no falla). */
export async function enBloqueConsistente<T>(pc: PublicClient, minBloque: bigint | undefined, f: (hasta: bigint) => Promise<T>): Promise<T> {
  let min = pisoDe(minBloque);
  const { reintentos, esperaMs } = ajustesLectura;
  for (let intento = 0; ; intento++) {
    const ultimo = intento >= reintentos;
    // cacheTime 0: viem guarda 4 s el último bloque y, justo después de escribir, el listado omitiría el cheque nuevo.
    const hasta = await pc.getBlockNumber({ cacheTime: 0 });
    if (hasta > ultimoBloqueVisto) ultimoBloqueVisto = hasta;
    // Un mínimo muy por encima del nodo no es atraso: es un valor inválido. Se lee sin esperar.
    if (min > hasta + MARGEN_BLOQUES) min = hasta;
    if (hasta < min && !ultimo) {
      await pausa(esperaMs);
      continue;
    }
    if (hasta < min) console.warn(`[chain] el nodo sigue atrasado tras ${reintentos} reintentos: bloque ${hasta} < mínimo ${min}; se sigue con el bloque ${hasta}.`);
    try {
      return await f(hasta);
    } catch (e) {
      if (!esBloqueFaltante(e) || ultimo) throw e;
      await pausa(esperaMs);
    }
  }
}

// Los logs de bloques ya asentados no cambian: se guardan en memoria y cada lectura pide solo lo nuevo (1 o 2 ventanas
// en vez de ~20). Se deja un margen de bloques sin guardar por si hubiera una reorganización.
const MARGEN_ASENTADO = 20n;
const logsAsentados = new WeakMap<PublicClient, Map<string, { hasta: bigint; logs: LogDecodificado[] }>>();

export async function leerLogs(pc: PublicClient, cfg: Pick<ConfigChain, "chequeFund" | "desdeBloque">, bloqueHasta?: bigint): Promise<LogDecodificado[]> {
  const eventos = ABI_FONDO.filter((x) => x.type === "event" && NOMBRES_EVENTOS.includes(x.name));
  const hasta = bloqueHasta ?? (await pc.getBlockNumber({ cacheTime: 0 }));
  const porCliente = logsAsentados.get(pc) ?? new Map();
  logsAsentados.set(pc, porCliente);
  const clave = `${cfg.chequeFund}|${cfg.desdeBloque}`;
  const guardado = porCliente.get(clave);
  const desdeNuevo = guardado ? guardado.hasta + 1n : cfg.desdeBloque;
  // Los RPC públicos limitan el rango de getLogs: se pide por ventanas, unas pocas a la vez.
  const ventanas: [bigint, bigint][] = [];
  for (let desde = desdeNuevo; desde <= hasta; desde += VENTANA_LOGS) {
    ventanas.push([desde, desde + VENTANA_LOGS - 1n > hasta ? hasta : desde + VENTANA_LOGS - 1n]);
  }
  const porVentana: LogDecodificado[][] = new Array(ventanas.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < ventanas.length) {
      const i = siguiente++;
      const [desde, h] = ventanas[i];
      porVentana[i] = (await pc.getLogs({ address: cfg.chequeFund, events: eventos as never, fromBlock: desde, toBlock: h })) as unknown as LogDecodificado[];
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA_LOGS, ventanas.length) }, trabajador));
  const previos: LogDecodificado[] = guardado ? guardado.logs.filter((l: LogDecodificado) => l.blockNumber <= hasta) : [];
  const todos = [...previos, ...porVentana.flat()].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
  const asentado = hasta - MARGEN_ASENTADO;
  if (asentado >= cfg.desdeBloque && (!guardado || asentado > guardado.hasta)) {
    porCliente.set(clave, { hasta: asentado, logs: todos.filter((l: LogDecodificado) => l.blockNumber <= asentado) });
  }
  return todos;
}

function armarCheques(logs: LogDecodificado[]): ChequeCadena[] {
  const mapa = new Map<string, ChequeCadena>();
  for (const l of logs) {
    if (!l.eventName.startsWith("Cheque")) continue;
    const id = String(l.args.id);
    if (l.eventName === "ChequeRegistrado") {
      const a = l.args.datos as Record<string, unknown>; // el evento v2 trae el struct completo
      mapa.set(id, {
        id: id as Hex,
        libradorHash: l.args.libradorHash as Hex,
        pyme: a.pyme as Address,
        nominal: a.nominal as bigint,
        precioCompra: a.precioCompra as bigint,
        vencimiento: BigInt(a.vencimiento as bigint),
        puntaje: Number(a.puntaje),
        tasaBps: Number(a.tasaBps),
        cotizacionHash: a.cotizacionHash as Hex,
        tipo: Number(a.tipo) === 1 ? "pagare" : "cheque",
        industria: Number(a.industria),
        tipoGarantia: TIPOS_GARANTIA[Number(a.tipoGarantia)] ?? "ninguna",
        coberturaBps: Number(a.coberturaBps),
        garantiaHash: a.garantiaHash as Hex,
        estado: "Pending",
        txs: [{ tipo: "registrar", hash: l.transactionHash }],
      });
      continue;
    }
    const c = mapa.get(id);
    if (!c) continue;
    if (l.eventName === "ChequeFondeado") {
      c.estado = "Funded";
      c.bloqueFondeo = l.blockNumber;
      c.txs.push({ tipo: "fondear", hash: l.transactionHash });
    } else if (l.eventName === "ChequePagado") {
      c.estado = "Paid";
      c.txs.push({ tipo: "pagado", hash: l.transactionHash });
    } else if (l.eventName === "ChequeRechazado") {
      c.estado = "Rejected";
      c.txs.push({ tipo: "rechazado", hash: l.transactionHash });
    }
  }
  return [...mapa.values()];
}

// Los timestamps de bloques ya escritos no cambian: se guardan para no pedirlos en cada lectura.
const marcasDeBloque = new Map<bigint, bigint>();
async function timestampDe(pc: PublicClient, bloque: bigint): Promise<bigint> {
  const guardado = marcasDeBloque.get(bloque);
  if (guardado !== undefined) return guardado;
  const b = await pc.getBlock({ blockNumber: bloque });
  marcasDeBloque.set(bloque, b.timestamp);
  return b.timestamp;
}
const isoDe = (unix: bigint): string => new Date(Number(unix) * 1000).toISOString();

/** Arma los rescates a partir de los eventos (Solicitado → Liquidado | Cancelado). El estado final lo dicen los eventos. */
export async function armarRescates(pc: PublicClient, logs: LogDecodificado[]): Promise<RescateVista[]> {
  const mapa = new Map<string, RescateVista & { bloque: bigint }>();
  for (const l of logs) {
    if (!l.eventName.startsWith("Rescate")) continue;
    const id = String(l.args.id);
    if (l.eventName === "RescateSolicitado") {
      mapa.set(id, {
        id,
        duenio: String(l.args.duenio),
        cuotapartes: unidadesADecimal(String(l.args.shares)),
        solicitadoEn: "",
        liquidableDesde: isoDe(BigInt(l.args.liquidableDesde as bigint)),
        estado: "Pendiente",
        monto: null,
        bloque: l.blockNumber,
      });
      continue;
    }
    const r = mapa.get(id);
    if (!r) continue;
    if (l.eventName === "RescateLiquidado") {
      r.estado = "Liquidado";
      r.monto = unidadesADecimal(String(l.args.assets));
    } else if (l.eventName === "RescateCancelado") r.estado = "Cancelado";
  }
  const lista = [...mapa.values()];
  await Promise.all(lista.map(async (r) => (r.solicitadoEn = isoDe(await timestampDe(pc, r.bloque)))));
  return lista.map(({ bloque: _b, ...r }) => (void _b, r));
}

/** TIR anualizada simple sobre los cheques cerrados: resultado neto / (capital × días) × 365, con el plazo del contrato (vencimiento − fondeo). */
async function tirBps(pc: PublicClient, cerrados: ChequeCadena[]): Promise<number | null> {
  if (cerrados.length === 0) return null;
  let neto = 0n;
  let capitalPorDia = 0n;
  const bloques = await Promise.all(cerrados.map((c) => (c.bloqueFondeo !== undefined ? pc.getBlock({ blockNumber: c.bloqueFondeo }) : null)));
  cerrados.forEach((c, i) => {
    const bloque = bloques[i];
    const dias = bloque ? (c.vencimiento > bloque.timestamp ? (c.vencimiento - bloque.timestamp) / 86_400n : 0n) : 0n;
    capitalPorDia += c.precioCompra * (dias > 0n ? dias : 1n);
    neto += c.estado === "Paid" ? c.nominal - c.precioCompra : -c.precioCompra;
  });
  if (capitalPorDia === 0n) return null;
  return Number((neto * 365n * 10_000n) / capitalPorDia);
}

function calcular(cfg: ConfigChain, minBloque?: bigint): Promise<EstadoCadena> {
  const pc = clienteSepolia(cfg);
  return enBloqueConsistente(pc, minBloque, (hasta) => calcularEn(pc, cfg, hasta));
}

async function calcularEn(pc: PublicClient, cfg: ConfigChain, hasta: bigint): Promise<EstadoCadena> {
  const blockNumber = hasta;
  const fondo = (functionName: string, args: readonly unknown[] = []) => pc.readContract({ address: cfg.chequeFund, abi: ABI_FONDO, functionName, args, blockNumber } as never);
  const [logs, totalAssets, liquidez, valorCuotaparte, totalSupply, comisionPendiente, feeReceptor, maxEmisorBps, maxIndustriaBps, liquidezMinBps, comisionAnualBps, modoDemo] = await Promise.all([
    leerLogs(pc, cfg, hasta),
    fondo("totalAssets") as Promise<bigint>,
    pc.readContract({ address: cfg.mockArgt, abi: ABI_ARGT, functionName: "balanceOf", args: [cfg.chequeFund], blockNumber }) as Promise<bigint>,
    fondo("convertToAssets", [UN_TOKEN]) as Promise<bigint>,
    fondo("totalSupply") as Promise<bigint>,
    fondo("comisionPendiente") as Promise<bigint>,
    fondo("feeReceptor") as Promise<Address>,
    fondo("maxConcentracionBps") as Promise<number>,
    fondo("maxIndustriaBps") as Promise<number>,
    fondo("liquidezMinBps") as Promise<number>,
    fondo("comisionAnualBps") as Promise<number>,
    fondo("modoDemo") as Promise<boolean>,
  ]);
  const cuotasDelReceptor = (await fondo("balanceOf", [feeReceptor])) as bigint;
  const comisionShares = cuotasDelReceptor + comisionPendiente; // devengada: ya emitida al receptor + la que falta emitir
  const comisionPesos = (await fondo("convertToAssets", [comisionShares])) as bigint;
  const cheques = armarCheques(logs);
  const rescates = await armarRescates(pc, logs);

  const exposicion = new Map<string, bigint>();
  const exposicionIndustria = new Map<number, bigint>();
  const funded = cheques.filter((x) => x.estado === "Funded");
  for (const c of funded) {
    exposicion.set(c.libradorHash, (exposicion.get(c.libradorHash) ?? 0n) + c.precioCompra);
    exposicionIndustria.set(c.industria, (exposicionIndustria.get(c.industria) ?? 0n) + c.precioCompra);
  }
  const maxExpo = [...exposicion.values()].reduce((m, v) => (v > m ? v : m), 0n);
  const concentracionMaxBps = totalAssets > 0n ? Number((maxExpo * 10_000n) / totalAssets) : 0;

  const conocidos = emisoresConocidos();
  const composicion: Composicion = componer(
    funded.map((c) => ({ emisor: c.libradorHash, emisorEtiqueta: etiquetaEmisor(c.libradorHash, conocidos), industria: c.industria, tipo: c.tipo, monto: c.precioCompra })),
  );
  const politica: PoliticaFondo = {
    ...POLITICA_POR_DEFECTO,
    maxEmisorBps: Number(maxEmisorBps),
    maxIndustriaBps: Number(maxIndustriaBps),
    liquidezMinBps: Number(liquidezMinBps),
    comisionAnualBps: Number(comisionAnualBps),
  };

  const cantidad: Record<EstadoCheque, number> = { Pending: 0, Funded: 0, Paid: 0, Rejected: 0 };
  for (const c of cheques) cantidad[c.estado] += 1;
  const rechazados = cheques.filter((c) => c.estado === "Rejected");
  const perdida = rechazados.reduce((s, c) => s + c.precioCompra, 0n);
  const cerrados = cheques.filter((c) => c.estado === "Paid" || c.estado === "Rejected");

  const resumen: ResumenFondo = {
    totalAssets: unidadesADecimal(totalAssets.toString()),
    liquidez: unidadesADecimal(liquidez.toString()),
    enCheques: unidadesADecimal((totalAssets - liquidez).toString()),
    valorCuotaparte: unidadesADecimal(valorCuotaparte.toString()),
    cantidadCheques: cantidad,
    concentracionMaxBps,
    rechazos: { cantidad: rechazados.length, perdida: unidadesADecimal(perdida.toString()) },
    tirAnualizadaBps: await tirBps(pc, cerrados),
    direccionContrato: cfg.chequeFund,
    red: "base-sepolia",
    politica,
    composicion,
    liquidezBps: totalAssets > 0n ? Number((liquidez * 10_000n) / totalAssets) : 0,
    cuotapartesEmitidas: unidadesADecimal(totalSupply.toString()),
    comision: { devengadaCuotapartes: unidadesADecimal(comisionShares.toString()), devengadaPesos: unidadesADecimal(comisionPesos.toString()) },
    rescatesPendientes: rescates.filter((r) => r.estado === "Pendiente").length,
    modoDemo,
  };
  return { cheques, totalAssets, liquidez, valorCuotaparte, exposicion, exposicionIndustria, rescates, resumen, bloque: hasta };
}

// Varias pantallas piden el estado a la vez: se comparte la lectura unos segundos.
let memo: { clave: string; hasta: number; min: bigint; bloque?: bigint; promesa: Promise<EstadoCadena> } | null = null;
const TTL_MS = 2_500;

export function invalidarEstado(): void {
  memo = null;
  memoCuentas = null;
}

/** `minBloque`: no devolver nada leído en un bloque anterior (p. ej. el de la última escritura del navegador). */
export function leerEstado(cfg: ConfigChain, minBloque?: bigint): Promise<EstadoCadena> {
  const clave = `${cfg.rpcSepolia}|${cfg.chequeFund}`;
  const ahora = Date.now();
  const min = pisoDe(minBloque);
  if (memo && memo.clave === clave && memo.hasta > ahora && (memo.bloque !== undefined ? memo.bloque >= min : memo.min >= min)) return memo.promesa;
  const promesa = calcular(cfg, min);
  const entrada: NonNullable<typeof memo> = { clave, hasta: ahora + TTL_MS, min, promesa };
  memo = entrada;
  promesa.then(
    (e) => {
      entrada.bloque = e.bloque;
    },
    () => {
      if (memo === entrada) memo = null;
    },
  );
  return promesa;
}

const bandaDelContrato = (puntaje: number) => bandaDe(puntaje);

/** Si la cotización original ya no está en memoria, se arma una explicación con lo que sí está en la blockchain. */
function explicacionDesdeCadena(c: ChequeCadena): string {
  return `Banda ${bandaDelContrato(c.puntaje)} (puntaje ${c.puntaje}/100), tasa ${formatBps(c.tasaBps)} anual. El fondo adelantó ${formatPesos(unidadesADecimal(c.precioCompra.toString()))} por un cheque de ${formatPesos(unidadesADecimal(c.nominal.toString()))}. El detalle del análisis está en la cotización verificable (código ${hashCorto(c.cotizacionHash)}).`;
}

/** Fecha (AAAA-MM-DD) en Buenos Aires: el cheque vence al final de ese día, y en UTC ya sería el día siguiente. */
export const fechaBA = (unix: bigint): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(Number(unix) * 1000));

export function aChequeVista(c: ChequeCadena, conocidos: Map<string, string> = emisoresConocidos()): ChequeVista {
  return {
    id: c.id,
    libradorHashCorto: hashCorto(c.libradorHash),
    nominal: unidadesADecimal(c.nominal.toString()),
    precioCompra: unidadesADecimal(c.precioCompra.toString()),
    vencimiento: fechaBA(c.vencimiento),
    puntaje: c.puntaje,
    banda: bandaDelContrato(c.puntaje),
    tasaTnaBps: c.tasaBps,
    estado: c.estado,
    explicacion: obtenerExplicacion(c.id) ?? explicacionDesdeCadena(c),
    txs: c.txs.map((t) => ({ tipo: t.tipo, hash: t.hash, url: urlTx(t.hash) })),
    tipo: c.tipo,
    industria: nombreIndustria(c.industria),
    emisorNombre: nombreEmisor(c.libradorHash, conocidos),
    garantia: c.tipoGarantia === "ninguna" ? null : { tipo: c.tipoGarantia, coberturaBps: c.coberturaBps },
  };
}

/** Cartera actual para el agente (herramienta ver_cartera_actual, `CarteraActual` de lib/agent/types.ts): exposición por librador, por industria (clave = id como string) y liquidez. */
export async function leerCartera(cfg: ConfigChain, minBloque?: bigint): Promise<{
  totalAssets: string;
  liquidez: string;
  valorCuotaparte: string;
  exposicionPorLibrador: Record<string, string>;
  exposicionPorIndustria: Record<string, string>;
}> {
  const e = await leerEstado(cfg, minBloque);
  const dec = (v: bigint) => unidadesADecimal(v.toString());
  return {
    totalAssets: dec(e.totalAssets),
    liquidez: dec(e.liquidez),
    valorCuotaparte: dec(e.valorCuotaparte),
    exposicionPorLibrador: Object.fromEntries([...e.exposicion].map(([hash, v]) => [hash, dec(v)])),
    exposicionPorIndustria: Object.fromEntries([...e.exposicionIndustria].map(([id, v]) => [String(id), dec(v)])),
  };
}

/** Rescates de la cadena (todos, del más viejo al más nuevo). */
export async function leerRescates(cfg: ConfigChain, minBloque?: bigint): Promise<RescateVista[]> {
  return (await leerEstado(cfg, minBloque)).rescates;
}

/** Posición de un inversor de demo: cuotapartes (las de su wallet, sin las que están en custodia por un rescate), valor y rescates. */
export async function leerPosicion(cfg: ConfigChain, cuenta: CuentaDemo, minBloque?: bigint): Promise<PosicionInversor> {
  const pc = clienteSepolia(cfg);
  const yo = direccionDe(cfg, cuenta);
  const [estado, cuotas] = await Promise.all([
    leerEstado(cfg, minBloque),
    enBloqueConsistente(pc, minBloque, (blockNumber) => pc.readContract({ address: cfg.chequeFund, abi: ABI_FONDO, functionName: "balanceOf", args: [yo], blockNumber }) as Promise<bigint>),
  ]);
  const valor = (cuotas * estado.valorCuotaparte) / UN_TOKEN;
  return {
    cuenta,
    cuotapartes: unidadesADecimal(cuotas.toString()),
    valor: unidadesADecimal(valor.toString()),
    rescates: estado.rescates.filter((r) => r.duenio.toLowerCase() === yo.toLowerCase()),
  };
}

/** Estado de las wallets de demo: saldo de gas, de mARGt y KYC. */
let memoCuentas: { clave: string; hasta: number; min: bigint; promesa: Promise<CuentaDemoEstado[]> } | null = null;
const TTL_CUENTAS_MS = 5_000;

/** Se comparte la lectura unos segundos; tras una escritura (piso de bloque más alto) o `invalidarEstado` se vuelve a leer. */
export function leerCuentas(cfg: ConfigChain, minBloque?: bigint): Promise<CuentaDemoEstado[]> {
  const clave = `${cfg.rpcSepolia}|${cfg.chequeFund}`;
  const min = pisoDe(minBloque);
  if (memoCuentas && memoCuentas.clave === clave && memoCuentas.hasta > Date.now() && memoCuentas.min >= min) return memoCuentas.promesa;
  const promesa = calcularCuentas(cfg, min);
  const entrada = { clave, hasta: Date.now() + TTL_CUENTAS_MS, min, promesa };
  memoCuentas = entrada;
  promesa.catch(() => {
    if (memoCuentas === entrada) memoCuentas = null;
  });
  return promesa;
}

async function calcularCuentas(cfg: ConfigChain, minBloque?: bigint): Promise<CuentaDemoEstado[]> {
  const pc = clienteSepolia(cfg);
  const roles: RolCuentaDemo[] = ["pyme", "inversor1", "inversor2", "originador", "oraculo", "admin"];
  return enBloqueConsistente(pc, minBloque, (blockNumber) =>
    Promise.all(
      roles.map(async (id) => {
        const direccion = direccionDe(cfg, id);
        const [eth, argt, kyc] = await Promise.all([
          pc.getBalance({ address: direccion, blockNumber }),
          pc.readContract({ address: cfg.mockArgt, abi: ABI_ARGT, functionName: "balanceOf", args: [direccion], blockNumber }) as Promise<bigint>,
          pc.readContract({ address: cfg.chequeFund, abi: ABI_FONDO, functionName: "kyc", args: [direccion], blockNumber }) as Promise<boolean>,
        ]);
        return { id, direccion, eth: formatEther(eth), argt: unidadesADecimal(argt.toString()), kyc };
      }),
    ),
  );
}
