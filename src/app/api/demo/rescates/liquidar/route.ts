// El gestor liquida los rescates vencidos o, con modoDemo, todos los pendientes. Responde el detalle
// (ResultadoLiquidacion) con una explicación del gestor sobre la liquidez y la reserva mínima del 15 %.
import { liquidarRescates } from "@/lib/chain";
import { exigirAcceso } from "../../../_lib/acceso";
import { conEscritura } from "../../../_lib/bloque";
import { conChain } from "../../../_lib/chain";
import { liquidarRescatesMock } from "../../../_lib/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denegado = exigirAcceso(req);
  if (denegado) return denegado;
  return conEscritura(req, (alBloque) =>
    conChain(
      async (cfg) => Response.json(await liquidarRescates(cfg, alBloque)),
      () => Response.json(liquidarRescatesMock()),
    ),
  );
}
