// GET detalle de un activo (cheque o pagaré): datos on-chain + informe del agente si el servidor todavía lo tiene en memoria. Público, igual que la lista.
import { aChequeVista, emisoresConocidos, leerEstado } from "@/lib/chain";
import { obtenerInforme } from "@/lib/chain/cotizaciones";
import type { ChequeDetalle } from "@/lib/detalle-cheque";
import { chequesMock } from "../../_lib/mock";
import { bloqueDeCookie } from "../../_lib/bloque";
import { conChain } from "../../_lib/chain";
import { error, esIdCheque } from "../../_lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_EXISTE = () => error("CHEQUE_INEXISTENTE", "No existe un activo con ese id.", 404);

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!esIdCheque(id)) return error("DATOS_INVALIDOS", "El id del activo tiene que ser 0x seguido de 64 caracteres hexadecimales.");
  return conChain(
    async (cfg) => {
      const c = (await leerEstado(cfg, bloqueDeCookie(req))).cheques.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!c) return NO_EXISTE();
      const vista = aChequeVista(c, emisoresConocidos());
      const guardado = obtenerInforme(c.id);
      // Si el informe en memoria es de otra cotización (otro análisis del mismo activo), no corresponde a lo registrado.
      const informe = guardado && guardado.cotizacion.cotizacionHash.toLowerCase() === c.cotizacionHash.toLowerCase() ? guardado : null;
      const detalle: ChequeDetalle = { cheque: vista, cotizacionHash: c.cotizacionHash, libradorHash: c.libradorHash, historial: vista.txs, informe };
      return Response.json(detalle);
    },
    () => {
      const v = chequesMock().find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!v) return NO_EXISTE();
      const detalle: ChequeDetalle = { cheque: v, cotizacionHash: null, libradorHash: null, historial: v.txs, informe: obtenerInforme(v.id) };
      return Response.json(detalle);
    },
  );
}
