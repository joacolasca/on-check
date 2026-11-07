import { aprobarKyc } from "@/lib/chain";
import { exigirAcceso } from "../../_lib/acceso";
import { conEscritura } from "../../_lib/bloque";
import { conChain } from "../../_lib/chain";
import { TX_FALSA, error, leerJson } from "../../_lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denegado = exigirAcceso(req);
  if (denegado) return denegado;
  const body = await leerJson(req);
  if (!body || (body.cuenta !== "inversor1" && body.cuenta !== "inversor2")) {
    return error("DATOS_INVALIDOS", "cuenta debe ser 'inversor1' o 'inversor2'.");
  }
  const cuenta = body.cuenta;
  return conEscritura(req, (alBloque) =>
    conChain(
      async (cfg) => Response.json(await aprobarKyc(cfg, cuenta, alBloque)),
      () => Response.json({ tx: TX_FALSA }),
    ),
  );
}
