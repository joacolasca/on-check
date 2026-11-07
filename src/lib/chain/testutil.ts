// Ayudas SOLO para tests: convierte la cotización de `cotizar()` en una cotización v2 completa (tipo, industria y, si se
// pide, garantía) y recalcula su hash. Cuando `cotizar()` ya devuelva los campos v2 (agente del gestor), pasa de largo.
import { hashearCotizacion } from "@/lib/scoring/cotizar";
import type { Cotizacion, GarantiaAnalisis, IndustriaEstimada, TipoActivo } from "@/shared/types";

export const INDUSTRIA_EJEMPLO: IndustriaEstimada = {
  id: 2,
  nombre: "Tecnología y comercio electrónico",
  fundamento: "Dato de prueba.",
  fuentes: ["BCRA"],
  confianza: "media",
};

export const GARANTIA_EJEMPLO: GarantiaAnalisis = {
  tipo: "energia",
  descripcion: "Turbina eólica de ejemplo",
  valorDeclarado: "16000000",
  haircutBps: 4500,
  valorAjustado: "8800000",
  coberturaBps: 11000,
  liquidez: "baja",
  riesgos: [],
  documentosPendientes: [],
  observaciones: "Dato de prueba.",
  analizadoPor: "determinista",
  garantiaHash: `0x${"fa".repeat(32)}`,
};

export function aV2(cot: Cotizacion, extra: { tipo?: TipoActivo; industria?: IndustriaEstimada; garantia?: GarantiaAnalisis } = {}): Cotizacion {
  const { cotizacionHash: _h, firma: _f, ...sin } = cot;
  void _h;
  void _f;
  const nueva: Omit<Cotizacion, "cotizacionHash"> = { ...sin, tipo: extra.tipo ?? sin.tipo ?? "cheque", industria: extra.industria ?? (sin.industria && sin.industria.id !== 0 ? sin.industria : INDUSTRIA_EJEMPLO), ...(extra.garantia ? { garantia: extra.garantia } : {}) };
  return { ...nueva, cotizacionHash: hashearCotizacion(nueva) };
}
