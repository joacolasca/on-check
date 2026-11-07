// Posición de un inversor de demo: cuotapartes, valor y rescates. GET /api/demo/posicion?cuenta=inversor1
import { leerPosicion } from "@/lib/chain";
import { bloqueDeCookie } from "../../_lib/bloque";
import { conChain } from "../../_lib/chain";
import { error } from "../../_lib/http";
import { posicionMock } from "../../_lib/mock";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cuenta = new URL(req.url).searchParams.get("cuenta");
  if (cuenta !== "inversor1" && cuenta !== "inversor2") return error("DATOS_INVALIDOS", "cuenta debe ser 'inversor1' o 'inversor2'.");
  return conChain(
    async (cfg) => Response.json(await leerPosicion(cfg, cuenta, bloqueDeCookie(req))),
    () => Response.json(posicionMock(cuenta)),
  );
}
