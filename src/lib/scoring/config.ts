import type { ConfigFondo } from "@/shared/types";

// Valores por defecto de DECISIONS.md (supuesto S2). Un solo lugar para cambiarlos cuando Facu confirme.
export const CONFIG_FONDO: ConfigFondo = {
  // TAMAR de bancos privados, nominal anual: 24,0625 % al 30-10-2026 (BCRA, estadísticas v4.0, variable 44). Redondeado a 2406 bps.
  // Decidido el 3-11-2026 (S2). Para actualizarlo: GET https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/44
  tamarTnaBps: 2406,
  spreadPorBandaBps: { A: 200, B: 400, C: 700, D: null },
  plazoMaxDias: 90,
  nominalMin: "1000000",
  nominalMax: "50000000",
};

// Tasa por puntaje y puntaje mínimo. Decidido el 7-11-2026 (TODO(confirmar quién lo decidió)).
// `spreadPorBandaBps` (arriba) queda en ConfigFondo porque es un tipo compartido, pero ya NO se usa para la tasa.
// tasa TNA = clamp(TAMAR + (100 − puntaje) × SPREAD_POR_PUNTO_BPS, TASA_MIN_BPS, TASA_MAX_BPS). Ej. con TAMAR 2406: 100 → 30 % (piso), 90 → 36,06 %, 70 → 60 % (tope).
export const SPREAD_POR_PUNTO_BPS = 120; // 1,2 pp por cada punto de puntaje que falta para 100
export const TASA_MIN_BPS = 3000; // piso: 30 % TNA
export const TASA_MAX_BPS = 6000; // tope: 60 % TNA
export const PUNTAJE_MINIMO = 70; // debajo de esto no se compra (bandas C y D)

export interface TasaPorPuntaje {
  /** Spread antes de aplicar piso y tope. */
  spreadBps: number;
  /** Tasa TNA final, con piso y tope. */
  tasaBps: number;
  aplicado: "piso" | "tope" | null;
}

/** Tasa TNA en bps para un puntaje (0–100) dado el TAMAR vigente. Función pura. */
export function tasaPorPuntaje(puntaje: number, tamarTnaBps: number = CONFIG_FONDO.tamarTnaBps): TasaPorPuntaje {
  const spreadBps = (100 - puntaje) * SPREAD_POR_PUNTO_BPS;
  const cruda = tamarTnaBps + spreadBps;
  if (cruda < TASA_MIN_BPS) return { spreadBps, tasaBps: TASA_MIN_BPS, aplicado: "piso" };
  if (cruda > TASA_MAX_BPS) return { spreadBps, tasaBps: TASA_MAX_BPS, aplicado: "tope" };
  return { spreadBps, tasaBps: cruda, aplicado: null };
}
