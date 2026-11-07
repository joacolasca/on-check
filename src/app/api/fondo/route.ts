// Resumen del fondo v2 (política, composición, liquidez, comisión, rescates): real (lee el contrato) o mock según haya contrato configurado.
import { leerEstado } from "@/lib/chain";
import { bloqueDeCookie } from "../_lib/bloque";
import { conChain } from "../_lib/chain";
import { fondoMock } from "../_lib/mock";

export const dynamic = "force-dynamic";

export async function GET(req?: Request) {
  return conChain(
    async (cfg) => Response.json((await leerEstado(cfg, bloqueDeCookie(req))).resumen),
    () => Response.json(fondoMock()),
  );
}
