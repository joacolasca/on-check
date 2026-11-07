// Estado del mandato: se crea, se actualiza con cada compra o rebote (funciones puras) y viaja firmado entre llamadas.
// La firma es un HMAC con el mismo secreto que las cotizaciones (COTIZACION_SECRETO; en desarrollo, el mismo fallback):
// así el presupuesto, lo invertido y los bloqueos no se pueden adulterar desde el navegador. `firma` queda fuera de lo firmado.
import { timingSafeEqual } from "node:crypto";
import { hmacConSecreto } from "@/lib/chain/cotizaciones";
import { canonico } from "@/lib/scoring/cotizar";
import { aCentavos, deCentavos } from "@/lib/scoring/dinero";
import type { CompraMandato, EstadoMandato, Mandato } from "@/shared/types";

/** La firma de un estado vale 12 horas (lo que dura una sesión de la demo); cada vez que el servidor lo actualiza, se firma de nuevo. */
export const VIGENCIA_ESTADO_S = 12 * 60 * 60;

export function crearEstadoInicial(mandato: Mandato, ahora: Date = new Date()): EstadoMandato {
  return {
    mandato,
    invertido: "0",
    disponible: deCentavos(aCentavos(mandato.presupuesto)),
    exposicionPorEmisor: {},
    emisoresBloqueados: [],
    compras: [],
    revocado: false,
    creadoEn: ahora.toISOString(),
  };
}

const sinFirma = (e: EstadoMandato): EstadoMandato => {
  const { firma: _firma, ...resto } = e;
  void _firma;
  return resto;
};

function recalcular(e: EstadoMandato, invertidoC: bigint, exposicion: Record<string, string>): EstadoMandato {
  const disponibleC = aCentavos(e.mandato.presupuesto) - invertidoC;
  return { ...e, invertido: deCentavos(invertidoC), disponible: deCentavos(disponibleC > 0n ? disponibleC : 0n), exposicionPorEmisor: exposicion };
}

/** Suma una compra fondeada: sube lo invertido y la exposición del emisor, baja lo disponible. */
export function aplicarCompra(e: EstadoMandato, compra: CompraMandato): EstadoMandato {
  const emisor = compra.libradorHash.toLowerCase();
  const exposicion = { ...e.exposicionPorEmisor };
  exposicion[emisor] = deCentavos(aCentavos(exposicion[emisor] ?? "0") + aCentavos(compra.precioCompra));
  const nuevo = recalcular(sinFirma(e), aCentavos(e.invertido) + aCentavos(compra.precioCompra), exposicion);
  return { ...nuevo, compras: [...e.compras, { ...compra, libradorHash: emisor }] };
}

/**
 * Un rebote: la compra pasa a `Rejected`, baja lo invertido y la exposición de ese emisor (el contrato también la libera) y el emisor
 * queda bloqueado. El presupuesto no se repone por la pérdida: lo disponible vuelve a ser presupuesto − invertido, como dice la spec.
 */
export function aplicarRebote(e: EstadoMandato, chequeId: string): EstadoMandato {
  const compra = e.compras.find((c) => c.chequeId.toLowerCase() === chequeId.toLowerCase());
  if (!compra) throw new Error("Ese cheque no es una compra de este mandato.");
  if (compra.estado !== "Funded") throw new Error("Esa compra ya no está fondeada: no se puede rebotar.");
  const emisor = compra.libradorHash.toLowerCase();
  const exposicion = { ...e.exposicionPorEmisor };
  const queda = aCentavos(exposicion[emisor] ?? "0") - aCentavos(compra.precioCompra);
  if (queda > 0n) exposicion[emisor] = deCentavos(queda);
  else delete exposicion[emisor];
  const invertidoC = aCentavos(e.invertido) - aCentavos(compra.precioCompra);
  const nuevo = recalcular(sinFirma(e), invertidoC > 0n ? invertidoC : 0n, exposicion);
  return {
    ...nuevo,
    compras: e.compras.map((c) => (c === compra ? { ...c, estado: "Rejected" as const } : c)),
    emisoresBloqueados: e.emisoresBloqueados.map((h) => h.toLowerCase()).includes(emisor) ? e.emisoresBloqueados : [...e.emisoresBloqueados, emisor],
  };
}

export const revocarEstado = (e: EstadoMandato): EstadoMandato => ({ ...sinFirma(e), revocado: true });

const contenidoFirmado = (e: EstadoMandato, exp: number): string => canonico({ v: "mandato-1", exp, estado: sinFirma(e) });

/** `${exp}.${hmacHex}` puesta en `firma`. Devuelve un estado nuevo (no muta el que recibe). */
export function firmarEstado(e: EstadoMandato, ahoraMs: number = Date.now()): EstadoMandato {
  const exp = Math.floor(ahoraMs / 1000) + VIGENCIA_ESTADO_S;
  return { ...sinFirma(e), firma: `${exp}.${hmacConSecreto(contenidoFirmado(e, exp))}` };
}

/** El estado, si trae una firma válida y vigente del servidor; si no, null (sin explicar por qué: no se le da pistas a quien lo adultera). */
export function verificarEstado(x: unknown, ahoraMs: number = Date.now()): EstadoMandato | null {
  if (x === null || typeof x !== "object" || Array.isArray(x)) return null;
  const e = x as EstadoMandato;
  const m = typeof e.firma === "string" ? /^(\d{1,12})\.([0-9a-f]{64})$/.exec(e.firma) : null;
  if (!m) return null;
  const exp = Number(m[1]);
  let esperado: string;
  try {
    esperado = hmacConSecreto(contenidoFirmado(e, exp));
  } catch {
    return null;
  }
  if (!timingSafeEqual(Buffer.from(m[2], "hex"), Buffer.from(esperado, "hex"))) return null;
  return exp * 1000 > ahoraMs ? e : null;
}
