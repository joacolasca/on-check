// Lista de rescates (RescateVista[]): real (eventos del contrato) o mock en memoria.
import { leerRescates } from "@/lib/chain";
import { bloqueDeCookie } from "../_lib/bloque";
import { conChain } from "../_lib/chain";
import { rescatesMock } from "../_lib/mock";

export const dynamic = "force-dynamic";

export async function GET(req?: Request) {
  return conChain(
    async (cfg) => Response.json(await leerRescates(cfg, bloqueDeCookie(req))),
    () => Response.json(rescatesMock()),
  );
}
