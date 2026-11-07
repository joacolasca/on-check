// Operaciones de escritura sobre el contrato, firmadas con las wallets de demo del servidor (D7).
import { maxUint256, parseEventLogs, parseUnits, type Address, type Hex } from "viem";
import { primeraViolacion } from "@/lib/concentracion";
import { formatPesos, unidadesADecimal } from "@/lib/format";
import type { Cotizacion, CuentaDemo, RescateVista } from "@/shared/types";
import { ABI_ARGT, ABI_FONDO } from "./abi";
import { billetera, clienteSepolia, direccionDe } from "./clientes";
import type { ConfigChain } from "./config";
import { chequeYaUsado, datosDeCheque, marcarChequeUsado, resolverCotizacion } from "./cotizaciones";
import { ErrorApi, traducirError } from "./errores";
import { resolverSuscripcion, type PedidoSuscripcion } from "./suscripcion";
import { explicarLiquidacion, type ResultadoLiquidacion } from "./rescates";
import { invalidarEstado, leerEstado, registrarBloqueEscrito } from "./estado";
import { nombreIndustria } from "./industrias";
import type { RolCuentaDemo } from "@/shared/types";

// Una cola por wallet: dos pedidos a la vez de la misma cuenta no pueden pisarse el nonce.
const colas = new Map<string, Promise<unknown>>();
function enCola<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
  const previa = colas.get(clave) ?? Promise.resolve();
  const siguiente = previa.then(tarea, tarea);
  colas.set(clave, siguiente.catch(() => undefined));
  return siguiente;
}

/** Se llama con el bloque de cada recibo; así la ruta puede fijar la cookie de "bloque mínimo" sin tocar la respuesta JSON. */
export type AlBloque = (bloque: bigint) => void;

async function enviar(cfg: ConfigChain, rol: RolCuentaDemo, destino: Address, abi: typeof ABI_FONDO, functionName: string, args: readonly unknown[], alBloque?: AlBloque): Promise<Hex> {
  const pc = clienteSepolia(cfg);
  const { account, wallet } = billetera(cfg, rol);
  const { request } = await pc.simulateContract({ account, address: destino, abi, functionName, args } as never);
  // Margen de gas: la estimación puede salir de un nodo con el estado un poco atrasado (la comisión devengada y los
  // rescates cambian con el tiempo) y la tx se quedaría sin gas. Se paga solo lo que se usa.
  const estimado = await pc.estimateContractGas({ account, address: destino, abi, functionName, args } as never);
  const hash = await wallet.writeContract({ ...(request as object), gas: (estimado * 13n) / 10n } as never);
  const recibo = await pc.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (recibo.status !== "success") throw new ErrorApi("TRANSACCION_FALLIDA", "La transacción falló en la blockchain.", 502);
  registrarBloqueEscrito(recibo.blockNumber);
  alBloque?.(recibo.blockNumber);
  invalidarEstado();
  return hash;
}

const envolver = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw traducirError(e);
  }
};

const pesos = (wei: bigint): string => formatPesos(unidadesADecimal(wei.toString()));

/**
 * Límites del fondo antes de enviar la tx (el contrato los repite en `fondearCheque` y es el control final): emisor, industria,
 * liquidez disponible y liquidez mínima, con la misma cuenta que el contrato (src/lib/concentracion.ts) y los topes que tiene el
 * contrato hoy (`resumen.politica`, leídos de la cadena). Si no se puede leer el estado, el error se propaga: sin verificación no se envía.
 */
async function exigirLimites(cfg: ConfigChain, d: { libradorHash: string; industria: number; precioCompra: bigint }, accion: string): Promise<void> {
  invalidarEstado(); // un control de límites no se apoya en la copia de hace unos segundos (otra instancia o el admin pudieron cambiar algo)
  const estado = await leerEstado(cfg);
  const pol = estado.resumen.politica;
  const clave = [...estado.exposicion.keys()].find((k) => k.toLowerCase() === d.libradorHash.toLowerCase());
  const v = primeraViolacion({
    patrimonio: estado.totalAssets,
    liquidez: estado.liquidez,
    exposicionEmisor: clave === undefined ? 0n : (estado.exposicion.get(clave) ?? 0n),
    exposicionIndustria: estado.exposicionIndustria.get(d.industria) ?? 0n,
    precioCompra: d.precioCompra,
    maxEmisorBps: BigInt(pol.maxEmisorBps),
    maxIndustriaBps: BigInt(pol.maxIndustriaBps),
    liquidezMinBps: BigInt(pol.liquidezMinBps),
  });
  if (!v) return;
  const cierre = "La regla también está dentro del contrato.";
  switch (v.tipo) {
    case "emisor":
      throw new ErrorApi(
        "CONCENTRACION_EXCEDIDA",
        `No ${accion} este activo: con él, el fondo tendría ${pesos(v.proyectada)} comprados a ese emisor y el tope permitido es ${pesos(v.maximo)}. ${cierre}`,
        409,
      );
    case "industria":
      throw new ErrorApi(
        "INDUSTRIA_EXCEDIDA",
        `No ${accion} este activo: con él, el fondo tendría ${pesos(v.proyectada)} en ${nombreIndustria(d.industria)} y el tope por industria es ${pesos(v.maximo)}. ${cierre}`,
        409,
      );
    case "sin_liquidez":
      throw new ErrorApi("SIN_LIQUIDEZ", `No ${accion} este activo: el fondo tiene ${pesos(v.disponible)} disponibles y la operación necesita ${pesos(v.precioCompra)}.`, 409);
    case "liquidez_minima":
      throw new ErrorApi(
        "LIQUIDEZ_MINIMA",
        `No ${accion} este activo: el fondo quedaría con ${pesos(v.liquidezPosterior)} de liquidez y el mínimo es ${pesos(v.minima)}. Esa reserva está para pagar rescates. ${cierre}`,
        409,
      );
  }
}

/** Registra el cheque cotizado (estado Pending). Devuelve el id del cheque y la tx. */
export function registrarCheque(cfg: ConfigChain, cotizacionId: string, cotizacionDelCliente?: Cotizacion, alBloque?: AlBloque) {
  return envolver(() =>
    enCola("originador", async () => {
      const cot = resolverCotizacion(cotizacionId, cotizacionDelCliente);
      // Solo se compran cheques de la pyme del servidor: si no, el adelanto iría a la wallet que eligió quien cotizó.
      if (typeof cot.input.pyme !== "string" || cot.input.pyme.toLowerCase() !== direccionDe(cfg, "pyme").toLowerCase()) {
        throw new ErrorApi("PYME_NO_AUTORIZADA", "La pyme de esa cotización no está autorizada para operar en esta demo.", 403);
      }
      // La marca de "ya usado" es por contrato: si se redespliega el fondo, los ids viejos no bloquean al nuevo.
      const usoKey = `${cfg.chequeFund.toLowerCase()}:${cot.id}`;
      if (chequeYaUsado(usoKey)) throw new ErrorApi("CHEQUE_YA_REGISTRADO", "Ese cheque ya está registrado.", 409);
      const datos = datosDeCheque(cot); // rechaza (422) las cotizaciones no aprobadas
      await exigirLimites(cfg, datos, "registramos");
      const tx = await enviar(cfg, "originador", cfg.chequeFund, ABI_FONDO, "registrarCheque", [cot.id, datos], alBloque);
      marcarChequeUsado(usoKey);
      return { chequeId: cot.id, tx };
    }),
  );
}

/** El fondo compra el cheque (Pending → Funded). Se rechaza antes de enviar con CONCENTRACION_EXCEDIDA, INDUSTRIA_EXCEDIDA, SIN_LIQUIDEZ o LIQUIDEZ_MINIMA. */
export function fondearCheque(cfg: ConfigChain, chequeId: string, alBloque?: AlBloque) {
  return envolver(() =>
    enCola("originador", async () => {
      // Si el cheque está Pending se revisan los límites con el estado de ahora; en cualquier otro caso decide el contrato (estado inválido, inexistente…).
      const cheque = (await leerEstado(cfg)).cheques.find((c) => c.id.toLowerCase() === chequeId.toLowerCase());
      if (cheque?.estado === "Pending") await exigirLimites(cfg, cheque, "compramos");
      return { tx: await enviar(cfg, "originador", cfg.chequeFund, ABI_FONDO, "fondearCheque", [chequeId], alBloque) };
    }),
  );
}

/** "Adelantar tiempo": el oráculo marca el cheque pagado (y transfiere el nominal) o rechazado. */
export function liquidarCheque(cfg: ConfigChain, chequeId: string, resultado: "pagado" | "rechazado", alBloque?: AlBloque) {
  return envolver(() =>
    enCola("oraculo", async () => {
      if (resultado === "pagado") await prepararOraculo(cfg, chequeId, alBloque);
      const tx = await enviar(cfg, "oraculo", cfg.chequeFund, ABI_FONDO, resultado === "pagado" ? "marcarPagado" : "marcarRechazado", [chequeId], alBloque);
      return { tx };
    }),
  );
}

/** El oráculo necesita mARGt (mint abierto de testnet) y permiso para que el fondo cobre el nominal. */
async function prepararOraculo(cfg: ConfigChain, chequeId: string, alBloque?: AlBloque): Promise<void> {
  const pc = clienteSepolia(cfg);
  const oraculo = direccionDe(cfg, "oraculo");
  const cheque = (await leerEstado(cfg)).cheques.find((c) => c.id.toLowerCase() === chequeId.toLowerCase());
  if (!cheque) throw new ErrorApi("CHEQUE_INEXISTENTE", "No existe un cheque con ese id.", 404);
  const [saldo, permiso] = await Promise.all([
    pc.readContract({ address: cfg.mockArgt, abi: ABI_ARGT, functionName: "balanceOf", args: [oraculo] }) as Promise<bigint>,
    pc.readContract({ address: cfg.mockArgt, abi: ABI_ARGT, functionName: "allowance", args: [oraculo, cfg.chequeFund] }) as Promise<bigint>,
  ]);
  if (saldo < cheque.nominal) await enviar(cfg, "oraculo", cfg.mockArgt, ABI_ARGT, "mint", [oraculo, cheque.nominal - saldo], alBloque);
  if (permiso < cheque.nominal) await enviar(cfg, "oraculo", cfg.mockArgt, ABI_ARGT, "approve", [cfg.chequeFund, maxUint256], alBloque);
}

/** El admin aprueba el KYC de una cuenta de inversor de demo. */
export function aprobarKyc(cfg: ConfigChain, cuenta: CuentaDemo, alBloque?: AlBloque) {
  // Sin clave de admin (producción) el KYC queda deshabilitado: se corta antes de tocar la red.
  if (!cfg.claves.admin) {
    return Promise.reject(new ErrorApi("CONFIGURACION", "El KYC está deshabilitado en este servidor: no hay clave de admin configurada (DEPLOYER_PRIVATE_KEY).", 503));
  }
  return envolver(() => enCola("admin", async () => ({ tx: await enviar(cfg, "admin", cfg.chequeFund, ABI_FONDO, "setKyc", [direccionDe(cfg, cuenta), true], alBloque) })));
}

/**
 * El inversor suscribe cuotapartes enteras (mínimo 1.000, de a 1): `previewMint` → mint de mARGt (faucet de testnet) por ese monto exacto
 * → `approve` → `mint`. Devuelve la tx y las cuotapartes y el monto realmente suscriptos (decimales).
 */
export function invertir(cfg: ConfigChain, cuenta: CuentaDemo, pedido: PedidoSuscripcion, alBloque?: AlBloque) {
  return envolver(() =>
    enCola(cuenta, async () => {
      const pc = clienteSepolia(cfg);
      const yo = direccionDe(cfg, cuenta);
      const tieneKyc = (await pc.readContract({ address: cfg.chequeFund, abi: ABI_FONDO, functionName: "kyc", args: [yo] })) as boolean;
      if (!tieneKyc) throw new ErrorApi("SIN_KYC", "Esa cuenta no tiene el KYC aprobado. Aprobalo primero.", 403);

      const valor = (await pc.readContract({ address: cfg.chequeFund, abi: ABI_FONDO, functionName: "convertToAssets", args: [10n ** 18n] })) as bigint;
      const cuotapartes = resolverSuscripcion(pedido, valor);
      const shares = cuotapartes * 10n ** 18n;
      const monto = (await pc.readContract({ address: cfg.chequeFund, abi: ABI_FONDO, functionName: "previewMint", args: [shares] })) as bigint;

      await enviar(cfg, cuenta, cfg.mockArgt, ABI_ARGT, "mint", [yo, monto], alBloque);
      await enviar(cfg, cuenta, cfg.mockArgt, ABI_ARGT, "approve", [cfg.chequeFund, monto], alBloque);
      const tx = await enviar(cfg, cuenta, cfg.chequeFund, ABI_FONDO, "mint", [shares, yo], alBloque);

      const recibo = await pc.getTransactionReceipt({ hash: tx });
      const dep = parseEventLogs({ abi: ABI_FONDO, logs: recibo.logs, eventName: "Deposit" })[0] as unknown as { args: { shares: bigint; assets: bigint } } | undefined;
      return {
        tx,
        shares: unidadesADecimal((dep?.args.shares ?? shares).toString()),
        monto: unidadesADecimal((dep?.args.assets ?? monto).toString()),
      };
    }),
  );
}

const aIso = (unix: bigint): string => new Date(Number(unix) * 1000).toISOString();

/** El inversor pide rescatar cuotapartes (quedan en custodia del fondo hasta que el gestor liquide). Firma el inversor. */
export function solicitarRescate(cfg: ConfigChain, cuenta: CuentaDemo, cuotapartes: string, alBloque?: AlBloque) {
  return envolver(() =>
    enCola(cuenta, async () => {
      const pc = clienteSepolia(cfg);
      const shares = parseUnits(cuotapartes, 18);
      const tx = await enviar(cfg, cuenta, cfg.chequeFund, ABI_FONDO, "solicitarRescate", [shares], alBloque);
      const recibo = await pc.getTransactionReceipt({ hash: tx });
      const ev = parseEventLogs({ abi: ABI_FONDO, logs: recibo.logs, eventName: "RescateSolicitado" })[0] as unknown as
        | { args: { id: bigint; duenio: Address; shares: bigint; liquidableDesde: bigint } }
        | undefined;
      if (!ev) throw new ErrorApi("ERROR_BLOCKCHAIN", "La transacción se confirmó pero no encontramos el rescate en sus eventos.", 502);
      const bloque = await pc.getBlock({ blockNumber: recibo.blockNumber });
      const rescate: RescateVista = {
        id: ev.args.id.toString(),
        duenio: ev.args.duenio,
        cuotapartes: unidadesADecimal(ev.args.shares.toString()),
        solicitadoEn: aIso(bloque.timestamp),
        liquidableDesde: aIso(BigInt(ev.args.liquidableDesde)),
        estado: "Pendiente",
        monto: null,
      };
      return { tx, rescate };
    }),
  );
}

/**
 * El gestor (wallet del oráculo, que en la demo tiene también GESTOR_ROLE) liquida los rescates vencidos o, con `modoDemo`,
 * todos los pendientes. Un rescate sin liquidez suficiente se omite (queda Pendiente) y se explica; fallos de gas, de
 * configuración o de red cortan todo.
 */
export function liquidarRescates(cfg: ConfigChain, alBloque?: AlBloque): Promise<ResultadoLiquidacion> {
  return envolver(() =>
    enCola("oraculo", async () => {
      const pc = clienteSepolia(cfg);
      invalidarEstado();
      const antes = await leerEstado(cfg);
      const ahora = (await pc.getBlock()).timestamp;
      const modoDemo = antes.resumen.modoDemo;
      const pendientes = antes.rescates.filter((r) => r.estado === "Pendiente");
      const elegibles = modoDemo ? pendientes : pendientes.filter((r) => BigInt(Math.floor(Date.parse(r.liquidableDesde) / 1000)) <= ahora);
      const liquidados: ResultadoLiquidacion["liquidados"] = [];
      const omitidos: ResultadoLiquidacion["omitidos"] = [];
      let pagado = 0n;
      for (const r of elegibles) {
        try {
          const tx = await enviar(cfg, "oraculo", cfg.chequeFund, ABI_FONDO, "liquidarRescate", [BigInt(r.id)], alBloque);
          const recibo = await pc.getTransactionReceipt({ hash: tx });
          const ev = parseEventLogs({ abi: ABI_FONDO, logs: recibo.logs, eventName: "RescateLiquidado" })[0] as unknown as { args: { assets: bigint } } | undefined;
          const monto = ev?.args.assets ?? 0n;
          pagado += monto;
          liquidados.push({ id: r.id, duenio: r.duenio, cuotapartes: r.cuotapartes, monto: unidadesADecimal(monto.toString()), tx });
        } catch (e) {
          const t = traducirError(e);
          if (!["SIN_LIQUIDEZ", "ESTADO_INVALIDO", "CONTRATO_REVIRTIO", "RESCATE_NO_VENCIDO", "RESCATE_NO_PENDIENTE", "SIN_KYC"].includes(t.codigo)) throw t;
          omitidos.push({ id: r.id, motivo: t.message });
        }
      }
      invalidarEstado();
      const despues = await leerEstado(cfg);
      const reservaMinimaBps = despues.resumen.politica.liquidezMinBps;
      const { texto, liquidezDespuesBps } = explicarLiquidacion({
        liquidezAntes: antes.liquidez,
        liquidezDespues: despues.liquidez,
        totalAssetsDespues: despues.totalAssets,
        pagado,
        cantidadLiquidados: liquidados.length,
        omitidos: omitidos.length,
        pendientesNoVencidos: pendientes.length - elegibles.length,
        reservaMinimaBps,
        modoDemo,
      });
      return {
        liquidados,
        omitidos,
        pendientesNoVencidos: pendientes.length - elegibles.length,
        liquidezAntes: unidadesADecimal(antes.liquidez.toString()),
        liquidezDespues: unidadesADecimal(despues.liquidez.toString()),
        liquidezDespuesBps,
        reservaMinimaBps,
        modoDemo,
        explicacionGestor: texto,
      };
    }),
  );
}

/** El admin del contrato prende o apaga el modo demo (el gestor puede liquidar rescates antes del plazo). */
export function setModoDemo(cfg: ConfigChain, activo: boolean, alBloque?: AlBloque) {
  if (!cfg.claves.admin) {
    return Promise.reject(new ErrorApi("CONFIGURACION", "El modo demo no se puede cambiar en este servidor: no hay clave de admin configurada (DEPLOYER_PRIVATE_KEY).", 503));
  }
  return envolver(() => enCola("admin", async () => ({ tx: await enviar(cfg, "admin", cfg.chequeFund, ABI_FONDO, "setModoDemo", [activo], alBloque), modoDemo: activo })));
}
