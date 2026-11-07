// Arma el informe del activo analizado y lo deja en memoria (12 h) para GET /api/cheques/[id]. Nunca rompe el análisis: si falla, devuelve undefined.
import { armarInforme, type InformeActivo } from "@/lib/agent/informe";
import type { ResultadoAgente } from "@/lib/agent/types";
import { guardarInforme } from "@/lib/chain";

export function informeDe(resultado: ResultadoAgente): InformeActivo | undefined {
  try {
    const informe = armarInforme(resultado, { generadoEn: new Date().toISOString() });
    guardarInforme(resultado.cotizacion.id, informe);
    return informe;
  } catch {
    return undefined;
  }
}
