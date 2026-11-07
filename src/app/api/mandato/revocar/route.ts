// POST { estado } → { estado } con revocado: true (firmado). Después, /ejecutar y /agente/mandato responden 409 MANDATO_REVOCADO.
// No exige el acceso de la demo: revocar siempre tiene que poder hacerse (igual hace falta un estado con firma válida).
import { firmarEstado, revocarEstado } from "@/lib/mandato/estado";
import { conErrorApi, leerEstadoFirmado } from "../../_lib/mandato";
import { error, leerJson } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await leerJson(req);
  if (!body) return error("DATOS_INVALIDOS", "Falta el estado del mandato.");
  const e = leerEstadoFirmado(body.estado);
  if ("respuesta" in e) return e.respuesta;
  return conErrorApi(() => Response.json({ estado: firmarEstado(revocarEstado(e.estado)) }));
}
