// ARGt real leído de Base mainnet (solo lectura). Con API_MODE=mock devuelve el dato de prueba (para desarrollar sin red).
import argtMock from "@fixtures/api/argt-real.json";
import { leerArgtReal, traducirError } from "@/lib/chain";
import type { ArgtReal } from "@/shared/types";
import { error } from "../_lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.API_MODE === "mock") return Response.json(argtMock as unknown as ArgtReal);
  try {
    return Response.json(await leerArgtReal());
  } catch (e) {
    const t = traducirError(e);
    return error("ARGT_NO_DISPONIBLE", "No pudimos leer el ARGt real de Base mainnet ahora. Reintentá en un momento.", t.status >= 500 ? t.status : 502);
  }
}
