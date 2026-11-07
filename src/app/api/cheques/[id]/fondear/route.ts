// Fondea el cheque. Real: el contrato puede rechazar con CONCENTRACION_EXCEDIDA o SIN_LIQUIDEZ.
// Mock: fondea siempre, salvo el id ID_CONCENTRACION, que simula el rechazo por concentración.
import { fondearCheque } from "@/lib/chain";
import { exigirAcceso } from "../../../_lib/acceso";
import { conEscritura } from "../../../_lib/bloque";
import { conChain } from "../../../_lib/chain";
import { ID_CONCENTRACION, TX_FALSA, error, esIdCheque } from "../../../_lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = exigirAcceso(req);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdCheque(id)) return error("DATOS_INVALIDOS", "El id del cheque tiene que ser 0x seguido de 64 caracteres hexadecimales.");
  return conEscritura(req, (alBloque) =>
    conChain(
      async (cfg) => Response.json(await fondearCheque(cfg, id, alBloque)),
      () =>
        id.toLowerCase() === ID_CONCENTRACION
          ? error("CONCENTRACION_EXCEDIDA", "Este librador ya concentra el máximo permitido del fondo (10 % del patrimonio). El contrato no deja comprar más cheques suyos.", 409)
          : Response.json({ tx: TX_FALSA }),
    ),
  );
}
