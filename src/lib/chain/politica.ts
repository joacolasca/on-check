// Política del fondo v2 (docs/V2-SPEC.md, "Reglas del fondo"). Las reglas duras las hace cumplir el contrato:
// acá solo se lee lo configurable (con el ABI real: maxConcentracionBps, maxIndustriaBps, liquidezMinBps, comisionAnualBps)
// y se completan las constantes que no viven en el contrato.
import type { PoliticaFondo } from "@/shared/types";

export const POLITICA_POR_DEFECTO: PoliticaFondo = {
  maxEmisorBps: 1000, // 10 %
  maxIndustriaBps: 2500, // 25 %
  liquidezMinBps: 1500, // 15 %
  objetivoTnaBps: 4000, // 40 %: objetivo, nunca una promesa
  comisionAnualBps: 300, // 3 % anual
  precioInicialCuotaparte: "1000",
  minCuotapartes: "1000", // suscripción mínima: 1.000 cuotapartes enteras, de a 1
  rescateHorasHabiles: 24,
  rescateCorteHora: 15,
};
