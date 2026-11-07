// El inversor de demo solicita un rescate de cuotapartes (firma el inversor). Las cuotapartes quedan en custodia del fondo
// hasta que el gestor liquide, a las 24 horas hábiles (corte 15 hs de Buenos Aires). Respuesta: { tx, rescate: RescateVista }.
import { solicitarRescate } from "@/lib/chain";
import { exigirAcceso } from "../../_lib/acceso";
import { conEscritura } from "../../_lib/bloque";
import { conChain } from "../../_lib/chain";
import { error, leerJson } from "../../_lib/http";
import { solicitarRescateMock } from "../../_lib/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denegado = exigirAcceso(req);
  if (denegado) return denegado;
  const body = await leerJson(req);
  if (!body || (body.cuenta !== "inversor1" && body.cuenta !== "inversor2") || typeof body.cuotapartes !== "string") {
    return error("DATOS_INVALIDOS", "Faltan cuenta ('inversor1' | 'inversor2') y cuotapartes (string decimal).");
  }
  const { cuenta, cuotapartes } = body;
  if (!/^\d+(\.\d{1,6})?$/.test(cuotapartes) || !/[1-9]/.test(cuotapartes)) {
    return error("DATOS_INVALIDOS", "Las cuotapartes tienen que ser un número decimal mayor a cero, con hasta 6 decimales.");
  }
  return conEscritura(req, (alBloque) =>
    conChain(
      async (cfg) => Response.json(await solicitarRescate(cfg, cuenta, cuotapartes, alBloque)),
      () => Response.json(solicitarRescateMock(cuenta, cuotapartes)),
    ),
  );
}
