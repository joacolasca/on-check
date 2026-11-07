// Interruptor de modoDemo (solo demo): con él prendido, el gestor puede liquidar rescates antes del plazo.
// Lo firma el admin del contrato (setModoDemo). Respuesta: { tx, modoDemo }.
import { setModoDemo } from "@/lib/chain";
import { exigirAcceso } from "../../_lib/acceso";
import { conEscritura } from "../../_lib/bloque";
import { conChain } from "../../_lib/chain";
import { error, leerJson } from "../../_lib/http";
import { setModoDemoMock } from "../../_lib/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denegado = exigirAcceso(req);
  if (denegado) return denegado;
  const body = await leerJson(req);
  if (!body || typeof body.activo !== "boolean") return error("DATOS_INVALIDOS", "Falta activo (true o false).");
  const { activo } = body;
  return conEscritura(req, (alBloque) =>
    conChain(
      async (cfg) => Response.json(await setModoDemo(cfg, activo, alBloque)),
      () => Response.json(setModoDemoMock(activo)),
    ),
  );
}
