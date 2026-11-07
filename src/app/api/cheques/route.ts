// GET lista los cheques; POST registra una cotización aceptada (Pending). Real o mock según haya contrato configurado.
import { aChequeVista, emisoresConocidos, leerEstado, registrarCheque } from "@/lib/chain";
import type { Cotizacion } from "@/shared/types";
import { chequesMock } from "../_lib/mock";
import { exigirAcceso } from "../_lib/acceso";
import { bloqueDeCookie, conEscritura } from "../_lib/bloque";
import { conChain } from "../_lib/chain";
import { TX_FALSA, error, esIdCheque, leerJson } from "../_lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req?: Request) {
  return conChain(
    async (cfg) => {
      const conocidos = emisoresConocidos();
      return Response.json((await leerEstado(cfg, bloqueDeCookie(req))).cheques.map((c) => aChequeVista(c, conocidos)).reverse()); // el más reciente arriba
    },
    () => Response.json(chequesMock()),
  );
}

export async function POST(req: Request) {
  const denegado = exigirAcceso(req);
  if (denegado) return denegado;
  const body = await leerJson(req);
  if (!body || !esIdCheque(body.cotizacionId)) return error("DATOS_INVALIDOS", "Falta cotizacionId (0x seguido de 64 caracteres hexadecimales).");
  const id = body.cotizacionId;
  // `cotizacion` es opcional: sirve si el servidor ya no tiene la cotización en memoria (se valida por su hash).
  const delCliente = body.cotizacion && typeof body.cotizacion === "object" ? (body.cotizacion as Cotizacion) : undefined;
  return conEscritura(req, (alBloque) =>
    conChain(
      async (cfg) => Response.json(await registrarCheque(cfg, id, delCliente, alBloque)),
      () => Response.json({ chequeId: id, tx: TX_FALSA }),
    ),
  );
}
