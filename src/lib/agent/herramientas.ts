// Herramientas por defecto del gestor. Ninguna mueve fondos: todas devuelven datos.
// Hoy usan los mocks de scoring y de la cartera (shared/fixtures); con contrato configurado, la cartera sale de la cadena.
import { hayChain, leerCartera, leerConfig } from "@/lib/chain";
import { analizarGarantiaBase, enriquecerGarantia } from "@/lib/garantias";
import { consultarMavSimulado } from "@/lib/mav";
import { CONFIG_FONDO } from "@/lib/scoring/config";
import { cotizar, scoreLibrador } from "@/lib/scoring";
import { cotizarMock, scoreLibradorMock } from "@/lib/scoring/mock";
import { analizarBalance } from "./balance";
import type { Enriquecedor } from "./enriquecedor";
import { clasificarIndustria } from "./industria";
import { POLITICA_FONDO } from "./politica";
import type { CarteraActual, Herramientas } from "./types";

// Cartera de prueba (sin contrato o en tests): el pool de demo de la v2 (docs/V2-SPEC.md, "Datos de demo"), todo en liquidez.
const CARTERA_DE_PRUEBA: CarteraActual = {
  totalAssets: "100000000",
  exposicionPorLibrador: {},
  exposicionPorIndustria: {},
  liquidez: "100000000",
};

/**
 * Scoring real (BCRA en vivo o copia guardada). Con SCORING_MODE=mock usa los datos fijos: así los tests no dependen de la red.
 * Con `enriquecedor` (un modelo), la industria y el análisis de la garantía se enriquecen; si falla, queda el análisis base.
 */
export function herramientasPorDefecto(opciones: { enriquecedor?: Enriquecedor } = {}): Herramientas {
  const mock = process.env.SCORING_MODE === "mock";
  const { enriquecedor } = opciones;
  return {
    async ver_politica_del_fondo() {
      return POLITICA_FONDO;
    },
    async consultar_bcra(cuit) {
      return mock ? scoreLibradorMock(cuit) : scoreLibrador(cuit);
    },
    async ver_cartera_actual() {
      // Cartera real del contrato cuando hay uno configurado (la capa chain irá llenando industria y liquidez); si no (o en tests), la de prueba.
      if (!mock && hayChain()) return leerCartera(leerConfig());
      return structuredClone(CARTERA_DE_PRUEBA);
    },
    async consultar_mav(cuit) {
      return consultarMavSimulado(cuit);
    },
    async analizar_balance(balance) {
      return analizarBalance(balance);
    },
    async clasificar_industria(ctx) {
      return clasificarIndustria(ctx, enriquecedor);
    },
    async analizar_garantia(garantia, nominal) {
      const base = analizarGarantiaBase(garantia, nominal);
      if (enriquecedor) {
        try {
          const extra = await enriquecedor.enriquecerGarantia(base, garantia);
          if (extra) return enriquecerGarantia(base, extra);
        } catch {
          // queda el análisis base
        }
      }
      return base;
    },
    async emitir_cotizacion(input, scoring, extras) {
      return mock ? cotizarMock(input, scoring, CONFIG_FONDO, extras) : cotizar(input, scoring, CONFIG_FONDO, extras);
    },
  };
}
