// Estado en memoria del modo mock (API_MODE=mock): permite solicitar y liquidar rescates de verdad dentro del proceso, para
// probar la UI sin contrato. Parte de shared/fixtures/api/*.json. Todo es de ejemplo: las tx son TX_FALSA, nunca reales.
import chequesFixture from "@fixtures/api/cheques.json";
import fondoFixture from "@fixtures/api/fondo.json";
import poolDemo from "@fixtures/cheques-demo.json";
import { parseUnits } from "viem";
import { formatPesos, hashCorto, unidadesADecimal, urlTx } from "@/lib/format";
import { componer } from "@/lib/chain/composicion";
import { ErrorApi } from "@/lib/chain/errores";
import { resolverSuscripcion, type PedidoSuscripcion } from "@/lib/chain/suscripcion";
import { idIndustriaPorNombre } from "@/lib/chain/industrias";
import { explicarLiquidacion, liquidableDesde, type ResultadoLiquidacion } from "@/lib/chain/rescates";
import { nombreEmisor } from "@/lib/chain/composicion";
import { nombreIndustria } from "@/lib/chain/industrias";
import type { ChequeVista, Cotizacion, CuentaDemo, PosicionInversor, RescateVista, ResumenFondo } from "@/shared/types";
import { TX_FALSA } from "./http";

const UN_TOKEN = 10n ** 18n;
const wei = (decimal: string) => parseUnits(decimal, 18);
const dec = (w: bigint) => unidadesADecimal(w.toString());
const CHEQUES = chequesFixture as unknown as ChequeVista[];
/** Misma dirección de ejemplo que devuelve /api/demo/cuentas en mock (orden pyme, inversor1, inversor2…). */
export const DIRECCION_MOCK: Record<CuentaDemo, string> = { inversor1: `0x${"2".padStart(40, "0")}`, inversor2: `0x${"3".padStart(40, "0")}` };

type RescateInterno = RescateVista & { shares: bigint };
/** Un activo comprado por el mandato en el mock: el fondo de ejemplo lo suma a su cartera. */
interface CompraMock {
  vista: ChequeVista;
  libradorHash: string;
  industria: number;
  precio: bigint;
}
interface EstadoMock {
  compras: CompraMock[];
  assets: bigint;
  supply: bigint;
  cuotas: Record<CuentaDemo, bigint>;
  rescates: RescateInterno[];
  modoDemo: boolean;
}

const g = globalThis as unknown as { __estadoMock?: EstadoMock };

function inicial(): EstadoMock {
  const precioInicial = 1000n;
  return {
    compras: [],
    assets: wei(fondoFixture.totalAssets),
    supply: wei(fondoFixture.cuotapartesEmitidas),
    cuotas: { inversor1: wei(poolDemo.pool_demo.inversor1_deposito) / precioInicial, inversor2: wei(poolDemo.pool_demo.inversor2_deposito) / precioInicial },
    rescates: [],
    modoDemo: fondoFixture.modoDemo,
  };
}
const estado = (): EstadoMock => (g.__estadoMock ??= inicial());

/** Para los tests. */
export function reiniciarMock(): void {
  g.__estadoMock = undefined;
}

const comprasEn = (estadoCompra: "Funded" | "Rejected"): CompraMock[] => estado().compras.filter((c) => c.vista.estado === estadoCompra);
const enChequesWei = (): bigint => CHEQUES.filter((c) => c.estado === "Funded").reduce((s, c) => s + wei(c.precioCompra), 0n) + comprasEn("Funded").reduce((s, c) => s + c.precio, 0n);
const valorCuotaWei = (e: EstadoMock): bigint => (e.supply > 0n ? (e.assets * UN_TOKEN) / e.supply : 1000n * UN_TOKEN);
const liquidezWei = (e: EstadoMock): bigint => (e.assets > enChequesWei() ? e.assets - enChequesWei() : 0n);
const vista = ({ shares: _s, ...r }: RescateInterno): RescateVista => (void _s, r);

export function chequesMock(): ChequeVista[] {
  const propios = [...estado().compras].reverse().map((c) => c.vista); // lo más reciente arriba
  return propios.length ? [...propios, ...CHEQUES] : CHEQUES;
}

export function fondoMock(): ResumenFondo {
  const e = estado();
  const { _nota, ...base } = fondoFixture as typeof fondoFixture & { _nota?: string };
  void _nota;
  const liquidez = liquidezWei(e);
  const propiosFondeados = comprasEn("Funded");
  const composicion = componer([
    ...CHEQUES.filter((c) => c.estado === "Funded").map((c) => ({
      emisor: c.libradorHashCorto,
      emisorEtiqueta: c.emisorNombre ?? c.libradorHashCorto,
      industria: idIndustriaPorNombre(c.industria) ?? 0,
      tipo: c.tipo,
      monto: wei(c.precioCompra),
    })),
    ...propiosFondeados.map((c) => ({ emisor: c.vista.libradorHashCorto, emisorEtiqueta: c.vista.emisorNombre ?? c.vista.libradorHashCorto, industria: c.industria, tipo: c.vista.tipo, monto: c.precio })),
  ]);
  const rechazadosPropios = comprasEn("Rejected");
  const baseResumen = base as unknown as ResumenFondo;
  return {
    ...baseResumen,
    cantidadCheques: {
      ...baseResumen.cantidadCheques,
      Funded: baseResumen.cantidadCheques.Funded + propiosFondeados.length,
      Rejected: baseResumen.cantidadCheques.Rejected + rechazadosPropios.length,
    },
    rechazos: { cantidad: baseResumen.rechazos.cantidad + rechazadosPropios.length, perdida: dec(wei(baseResumen.rechazos.perdida) + rechazadosPropios.reduce((s, c) => s + c.precio, 0n)) },
    totalAssets: dec(e.assets),
    liquidez: dec(liquidez),
    enCheques: dec(enChequesWei()),
    valorCuotaparte: dec(valorCuotaWei(e)),
    composicion,
    liquidezBps: e.assets > 0n ? Number((liquidez * 10_000n) / e.assets) : 0,
    cuotapartesEmitidas: dec(e.supply),
    rescatesPendientes: e.rescates.filter((r) => r.estado === "Pendiente").length,
    modoDemo: e.modoDemo,
  };
}

export function rescatesMock(): RescateVista[] {
  return estado().rescates.map(vista);
}

export function posicionMock(cuenta: CuentaDemo): PosicionInversor {
  const e = estado();
  const cuotas = e.cuotas[cuenta];
  return {
    cuenta,
    cuotapartes: dec(cuotas),
    valor: dec((cuotas * valorCuotaWei(e)) / UN_TOKEN),
    rescates: e.rescates.filter((r) => r.duenio === DIRECCION_MOCK[cuenta]).map(vista),
  };
}

/** Valor de la cuotaparte de ahora (wei por cuotaparte), para los topes de la ruta. */
export const valorCuotaparteMockWei = (): bigint => valorCuotaWei(estado());

/**
 * Suscripción de ejemplo con la misma regla que el contrato: cuotapartes enteras, mínimo 1.000, de a 1. Con `monto` (pesos) se
 * suscribe floor(monto / valorCuotaparte); el costo es el que dice previewMint (redondeo hacia arriba).
 */
export function suscribirMock(cuenta: CuentaDemo, pedido: PedidoSuscripcion): { tx: string; shares: string; monto: string } {
  const e = estado();
  const cuotapartes = resolverSuscripcion(pedido, valorCuotaWei(e));
  const shares = cuotapartes * UN_TOKEN;
  const costo = e.supply > 0n && e.assets > 0n ? (shares * e.assets + e.supply - 1n) / e.supply : shares * 1000n;
  e.assets += costo;
  e.supply += shares;
  e.cuotas[cuenta] += shares;
  return { tx: TX_FALSA, shares: dec(shares), monto: dec(costo) };
}

/** Las cuotapartes quedan en custodia (salen de la posición del inversor) hasta que el gestor liquide. */
export function solicitarRescateMock(cuenta: CuentaDemo, cuotapartes: string, ahoraMs = Date.now()): { tx: string; rescate: RescateVista } {
  const e = estado();
  const shares = wei(cuotapartes);
  if (shares > e.cuotas[cuenta]) throw new ErrorApi("CUOTAPARTES_INSUFICIENTES", "Esa cuenta no tiene tantas cuotapartes para rescatar.", 409);
  e.cuotas[cuenta] -= shares;
  const r: RescateInterno = {
    id: String(e.rescates.length + 1),
    duenio: DIRECCION_MOCK[cuenta],
    cuotapartes: dec(shares),
    solicitadoEn: new Date(ahoraMs).toISOString(),
    liquidableDesde: new Date(liquidableDesde(ahoraMs)).toISOString(),
    estado: "Pendiente",
    monto: null,
    shares,
  };
  e.rescates.push(r);
  return { tx: TX_FALSA, rescate: vista(r) };
}

export function setModoDemoMock(activo: boolean): { tx: string; modoDemo: boolean } {
  estado().modoDemo = activo;
  return { tx: TX_FALSA, modoDemo: activo };
}

/** El gestor liquida los vencidos o, con modoDemo, todos los pendientes; el que no tiene liquidez queda pendiente y se explica. */
export function liquidarRescatesMock(ahoraMs = Date.now()): ResultadoLiquidacion {
  const e = estado();
  const reservaMinimaBps = fondoFixture.politica.liquidezMinBps;
  const liquidezAntes = liquidezWei(e);
  const pendientes = e.rescates.filter((r) => r.estado === "Pendiente");
  const elegibles = e.modoDemo ? pendientes : pendientes.filter((r) => Date.parse(r.liquidableDesde) <= ahoraMs);
  const liquidados: ResultadoLiquidacion["liquidados"] = [];
  const omitidos: ResultadoLiquidacion["omitidos"] = [];
  let pagado = 0n;
  for (const r of elegibles) {
    const monto = e.supply > 0n ? (r.shares * e.assets) / e.supply : 0n;
    if (monto > liquidezWei(e)) {
      omitidos.push({ id: r.id, motivo: `No hay liquidez suficiente: hay ${dec(liquidezWei(e))} disponibles y el rescate necesita ${dec(monto)}.` });
      continue;
    }
    e.assets -= monto;
    e.supply -= r.shares;
    r.estado = "Liquidado";
    r.monto = dec(monto);
    pagado += monto;
    liquidados.push({ id: r.id, duenio: r.duenio, cuotapartes: r.cuotapartes, monto: dec(monto), tx: TX_FALSA });
  }
  const { texto, liquidezDespuesBps } = explicarLiquidacion({
    liquidezAntes,
    liquidezDespues: liquidezWei(e),
    totalAssetsDespues: e.assets,
    pagado,
    cantidadLiquidados: liquidados.length,
    omitidos: omitidos.length,
    pendientesNoVencidos: pendientes.length - elegibles.length,
    reservaMinimaBps,
    modoDemo: e.modoDemo,
  });
  return {
    liquidados,
    omitidos,
    pendientesNoVencidos: pendientes.length - elegibles.length,
    liquidezAntes: dec(liquidezAntes),
    liquidezDespues: dec(liquidezWei(e)),
    liquidezDespuesBps,
    reservaMinimaBps,
    modoDemo: e.modoDemo,
    explicacionGestor: texto,
  };
}

// ---------------------------------------------------------------------------------------------------- mandato (compra y rebote de ejemplo)

const pesosW = (w: bigint): string => formatPesos(dec(w));

/**
 * Registra y fondea un activo de ejemplo con las mismas reglas del contrato (10 % por emisor, 25 % por industria, 15 % de liquidez, sobre
 * el patrimonio). Solo cuenta lo comprado por el mandato: el fondo de ejemplo parte sin cartera propia para este circuito. Las tx son TX_FALSA.
 */
export function comprarMock(cot: Cotizacion): { tx: string } {
  const e = estado();
  if (e.compras.some((c) => c.vista.id.toLowerCase() === cot.id.toLowerCase())) throw new ErrorApi("CHEQUE_YA_REGISTRADO", "Ese cheque ya está registrado.", 409);
  const precio = wei(cot.precioCompra);
  const politica = fondoFixture.politica;
  const propios = comprasEn("Funded");
  const delEmisor = propios.filter((c) => c.libradorHash.toLowerCase() === cot.libradorHash.toLowerCase()).reduce((s, c) => s + c.precio, 0n) + precio;
  const maxEmisor = (e.assets * BigInt(politica.maxEmisorBps)) / 10_000n;
  if (delEmisor > maxEmisor) {
    throw new ErrorApi(
      "CONCENTRACION_EXCEDIDA",
      `El contrato no dejó comprar este cheque: con él, el fondo tendría ${pesosW(delEmisor)} comprados a ese librador y el tope permitido es ${pesosW(maxEmisor)}. La regla de concentración está dentro del contrato.`,
      409,
    );
  }
  const industria = cot.industria?.id ?? 0;
  const deLaIndustria = propios.filter((c) => c.industria === industria).reduce((s, c) => s + c.precio, 0n) + precio;
  const maxIndustria = (e.assets * BigInt(politica.maxIndustriaBps)) / 10_000n;
  if (deLaIndustria > maxIndustria) {
    throw new ErrorApi(
      "INDUSTRIA_EXCEDIDA",
      `El contrato no dejó comprar este activo: con él, el fondo tendría ${pesosW(deLaIndustria)} en ${nombreIndustria(industria)} y el tope por industria es ${pesosW(maxIndustria)}. La regla está dentro del contrato.`,
      409,
    );
  }
  const liquidezPosterior = liquidezWei(e) > precio ? liquidezWei(e) - precio : 0n;
  const minima = (e.assets * BigInt(politica.liquidezMinBps)) / 10_000n;
  if (liquidezWei(e) < precio || liquidezPosterior < minima) {
    throw new ErrorApi(
      "LIQUIDEZ_MINIMA",
      `El contrato no dejó comprar este activo: el fondo quedaría con ${pesosW(liquidezPosterior)} de liquidez y el mínimo es ${pesosW(minima)}. Esa reserva está para pagar rescates.`,
      409,
    );
  }
  const nombre = nombreEmisor(cot.libradorHash);
  e.compras.push({
    libradorHash: cot.libradorHash,
    industria,
    precio,
    vista: {
      id: cot.id,
      libradorHashCorto: hashCorto(cot.libradorHash),
      nominal: cot.input.nominal,
      precioCompra: cot.precioCompra,
      vencimiento: cot.input.vencimiento.slice(0, 10),
      puntaje: cot.scoring.puntaje,
      banda: cot.scoring.banda,
      tasaTnaBps: cot.tasaTnaBps,
      estado: "Funded",
      explicacion: cot.explicacion,
      txs: [
        { tipo: "registrar", hash: TX_FALSA, url: urlTx(TX_FALSA) },
        { tipo: "fondear", hash: TX_FALSA, url: urlTx(TX_FALSA) },
      ],
      tipo: cot.tipo,
      industria: nombreIndustria(industria),
      emisorNombre: nombre,
      garantia: cot.garantia ? { tipo: cot.garantia.tipo, coberturaBps: cot.garantia.coberturaBps } : null,
    },
  });
  return { tx: TX_FALSA };
}

/** El oráculo marca rechazado un activo comprado por el mandato: el patrimonio baja lo que costó (la pérdida) y el cheque queda Rejected. */
export function rebotarMock(chequeId: string): { tx: string; perdida: string } {
  const e = estado();
  const compra = e.compras.find((c) => c.vista.id.toLowerCase() === chequeId.toLowerCase());
  if (!compra) throw new ErrorApi("CHEQUE_INEXISTENTE", "No existe un cheque con ese id.", 404);
  if (compra.vista.estado !== "Funded") throw new ErrorApi("ESTADO_INVALIDO", "El cheque no está en el estado correcto para esa operación (por ejemplo, ya fue fondeado o ya se cerró).", 409);
  compra.vista = { ...compra.vista, estado: "Rejected", txs: [...compra.vista.txs, { tipo: "rechazado", hash: TX_FALSA, url: urlTx(TX_FALSA) }] };
  e.assets = e.assets > compra.precio ? e.assets - compra.precio : 0n;
  return { tx: TX_FALSA, perdida: dec(compra.precio) };
}
