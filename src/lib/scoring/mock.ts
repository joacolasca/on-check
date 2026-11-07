// MOCK (Fase 0): datos fijos. Los tests lo usan con SCORING_MODE=mock para no depender de la red.
// El scoring real está en index.ts.
import cotizacionFija from "@fixtures/api/cotizacion.json";
import { camposV2, inputPublico, type ExtrasCotizacion } from "./cotizar";
import type {
  ConfigFondo,
  Cotizacion,
  InputCotizacion,
  ResultadoScoring,
  ScoreOpts,
} from "@/shared/types";

const FIJO = cotizacionFija as unknown as Cotizacion;

export async function scoreLibradorMock(cuit: string, _opts?: ScoreOpts): Promise<ResultadoScoring> {
  return { ...FIJO.scoring, cuit };
}

export function cotizarMock(
  input: InputCotizacion,
  scoring: ResultadoScoring,
  _config: ConfigFondo,
  extras?: ExtrasCotizacion,
): Cotizacion {
  // El fixture es de la forma v1: se completan los campos v2 (tipo, industria y lo que aporte el gestor).
  return { ...FIJO, ...camposV2(input, extras), input: inputPublico(input), scoring };
}
