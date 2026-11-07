// POST { mandato } → { estado } firmado. Valida el mandato (presupuesto, tope, plazo, instrumentos, cobertura, banda, aprobación).
import { crearEstadoInicial, firmarEstado } from "@/lib/mandato/estado";
import { validarMandato } from "@/lib/mandato/politica";
import { conErrorApi } from "../../_lib/mandato";
import { error, leerJson } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await leerJson(req);
  if (!body) return error("DATOS_INVALIDOS", "Falta el mandato.");
  const m = validarMandato(body.mandato);
  if (!m.ok) return error("MANDATO_INVALIDO", m.mensaje);
  return conErrorApi(() => Response.json({ estado: firmarEstado(crearEstadoInicial(m.mandato)) }));
}
