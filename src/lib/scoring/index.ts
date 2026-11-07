// Scoring + cotización (enchufe 2 de docs/INTERFACES.md). Dueño: Nacho; implementación inicial hecha por Joaquín el 3-11-2026.
import type { ConfigFondo, Cotizacion, InputCotizacion, ResultadoScoring, ScoreOpts } from "@/shared/types";
import { consultarBcra } from "./bcra";
import { cotizar as cotizarReal, type ExtrasCotizacion } from "./cotizar";
import { calcularPuntaje } from "./puntaje";

export { CuitSinDatosError } from "./bcra-tipos";
export { cotizacionIntegra, hashLibrador, hashearCotizacion, type ExtrasCotizacion } from "./cotizar";

/** Puntúa al librador (quien paga el cheque) con datos de la Central de Deudores. */
export async function scoreLibrador(cuit: string, opts?: ScoreOpts): Promise<ResultadoScoring> {
  const limpio = cuit.replace(/\D/g, "");
  const modoEnv = process.env.BCRA_MODE;
  const modo = opts?.modo ?? (modoEnv === "live" || modoEnv === "cache" || modoEnv === "auto" ? modoEnv : undefined);
  const datos = await consultarBcra(limpio, { modo });
  return calcularPuntaje(datos);
}

export function cotizar(input: InputCotizacion, scoring: ResultadoScoring, config: ConfigFondo, extras?: ExtrasCotizacion): Cotizacion {
  return cotizarReal(input, scoring, config, undefined, undefined, extras);
}
