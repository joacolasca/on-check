// Política del fondo (docs/V2-SPEC.md, "Reglas del fondo"). El contrato la hace cumplir; el gestor la consulta y avisa.
import { PUNTAJE_MINIMO, SPREAD_POR_PUNTO_BPS, TASA_MAX_BPS, TASA_MIN_BPS } from "@/lib/scoring/config";
import type { PoliticaFondo } from "@/shared/types";

/** Reglas de precio y exclusión que aplica cotizar() (decididas el 7-11-2026). El gestor las ve en el prompt y en las herramientas, pero no las decide. */
export const REGLAS_DE_COTIZACION = `puntaje mínimo ${PUNTAJE_MINIMO} (debajo no se compra); tasa anual = TAMAR + ${String(SPREAD_POR_PUNTO_BPS / 100).replace(".", ",")} pp por cada punto que le falta al puntaje para 100, con piso de ${TASA_MIN_BPS / 100} % y tope de ${TASA_MAX_BPS / 100} %; nunca se compran cheques de emisores con cheques rechazados impagos confirmados por el BCRA, de cualquier antigüedad; si esos datos no se pueden verificar, no se aprueba`;

export const POLITICA_FONDO: PoliticaFondo = {
  maxEmisorBps: 1000, // 10 %
  maxIndustriaBps: 2500, // 25 %
  liquidezMinBps: 1500, // 15 %, en ARGt (representa una cuenta remunerada, simulada)
  objetivoTnaBps: 4000, // 40 % TNA: un objetivo, nunca una promesa
  comisionAnualBps: 300, // 3 % anual sobre el patrimonio, devengada día a día
  precioInicialCuotaparte: "1000",
  minCuotapartes: "1000", // suscripción mínima: 1.000 cuotapartes enteras, de a 1
  rescateHorasHabiles: 24,
  rescateCorteHora: 15, // hora de Buenos Aires
};
