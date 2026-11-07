// "Adelantar tiempo": el oráculo marca el cheque como pagado o rechazado.
import { liquidarCheque } from "@/lib/chain";
import { exigirAcceso } from "../../_lib/acceso";
import { conEscritura } from "../../_lib/bloque";
import { conChain } from "../../_lib/chain";
import { TX_FALSA, error, esIdCheque, esString, leerJson } from "../../_lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denegado = exigirAcceso(req);
  if (denegado) return denegado;
  const body = await leerJson(req);
  if (!body || !esString(body.chequeId) || (body.resultado !== "pagado" && body.resultado !== "rechazado")) {
    return error("DATOS_INVALIDOS", "Faltan chequeId y resultado ('pagado' | 'rechazado').");
  }
  if (!esIdCheque(body.chequeId)) return error("DATOS_INVALIDOS", "chequeId tiene que ser 0x seguido de 64 caracteres hexadecimales.");
  const { chequeId, resultado } = body;
  return conEscritura(req, (alBloque) =>
    conChain(
      async (cfg) => Response.json(await liquidarCheque(cfg, chequeId, resultado, alBloque)),
      () => Response.json({ tx: TX_FALSA }),
    ),
  );
}
