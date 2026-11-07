// POST { estado, chequeId, evaluaciones? } → ReboteMandato. Exige el acceso de la demo. El oráculo marca el cheque como rechazado
// (rebote SIMULADO: se rotula así), el servidor lee la pérdida, bloquea al emisor, baja lo invertido y arma la replanificación.
// `evaluaciones` (opcional): las evaluaciones de la corrida (activoId y razones); sin ellas no hay nada que replanificar.
import { liquidarCheque, leerEstado } from "@/lib/chain";
import { unidadesADecimal } from "@/lib/format";
import { leerBandeja } from "@/lib/mandato/bandeja";
import { aplicarRebote, firmarEstado } from "@/lib/mandato/estado";
import { esMontoMandato } from "@/lib/mandato/politica";
import { activosParaReplanificar, explicarRebote, type EvaluacionPrevia } from "@/lib/mandato/rebote";
import type { ReboteMandato, ReglaMandato } from "@/shared/types";
import { exigirAcceso } from "../../_lib/acceso";
import { conEscritura } from "../../_lib/bloque";
import { conChain } from "../../_lib/chain";
import { error, esIdCheque, leerJson } from "../../_lib/http";
import { conErrorApi, leerEstadoFirmado } from "../../_lib/mandato";
import { rebotarMock } from "../../_lib/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_EVALUACIONES = 50;
const REGLAS: readonly ReglaMandato[] = ["revocado", "tipo", "plazo", "cotizacion", "banda", "gestor", "cobertura", "emisor_bloqueado", "tope_emisor", "presupuesto", "aprobacion"];

/** Lee solo lo que hace falta de las evaluaciones del navegador; null si no tienen la forma esperada. */
function leerPrevias(valor: unknown): EvaluacionPrevia[] | null {
  if (valor === undefined) return [];
  if (!Array.isArray(valor) || valor.length > MAX_EVALUACIONES) return null;
  const previas: EvaluacionPrevia[] = [];
  for (const v of valor as { activoId?: unknown; razones?: unknown; cotizacion?: { libradorHash?: unknown; precioCompra?: unknown } }[]) {
    if (!v || typeof v.activoId !== "string" || !Array.isArray(v.razones)) return null;
    const razones: EvaluacionPrevia["razones"] = [];
    for (const r of v.razones as { regla?: unknown; cumple?: unknown }[]) {
      if (!r || typeof r.cumple !== "boolean" || !REGLAS.includes(r.regla as ReglaMandato)) return null;
      razones.push({ regla: r.regla as ReglaMandato, cumple: r.cumple });
    }
    const hash = v.cotizacion?.libradorHash;
    const precio = v.cotizacion?.precioCompra;
    previas.push({ activoId: v.activoId, razones, ...(typeof hash === "string" ? { libradorHash: hash } : {}), ...(esMontoMandato(precio) ? { precioCompra: precio } : {}) });
  }
  return previas;
}

export async function POST(req: Request) {
  const denegado = exigirAcceso(req);
  if (denegado) return denegado;
  const body = await leerJson(req);
  if (!body) return error("DATOS_INVALIDOS", "Faltan el estado del mandato y el chequeId.");
  const e = leerEstadoFirmado(body.estado);
  if ("respuesta" in e) return e.respuesta;
  const { estado } = e;
  if (!esIdCheque(body.chequeId)) return error("DATOS_INVALIDOS", "chequeId tiene que ser 0x seguido de 64 caracteres hexadecimales.");
  const chequeId = body.chequeId;
  const previas = leerPrevias(body.evaluaciones);
  if (!previas) return error("DATOS_INVALIDOS", `Las evaluaciones tienen que ser una lista de hasta ${MAX_EVALUACIONES} con activoId y razones.`);

  const compra = estado.compras.find((c) => c.chequeId.toLowerCase() === chequeId.toLowerCase());
  if (!compra) return error("COMPRA_INEXISTENTE", "Ese cheque no es una compra de este mandato.", 404);
  if (compra.estado !== "Funded") return error("COMPRA_NO_FONDEADA", "Esa compra ya no está fondeada (se pagó o ya rebotó): no se puede rebotar.", 409);

  return conErrorApi(() =>
    conEscritura(req, (alBloque) => {
      const armar = (tx: string, perdida: string): Response => {
        const nuevo = firmarEstado(aplicarRebote(estado, compra.chequeId));
        const { activos } = leerBandeja();
        const replanificar = activosParaReplanificar(nuevo, activos.map((a) => a.id), previas);
        const nombresReplan = replanificar.map((id) => activos.find((a) => a.id === id)?.nombre ?? id);
        const rebote: ReboteMandato = {
          estado: nuevo,
          chequeId: compra.chequeId,
          perdida,
          emisorBloqueado: compra.nombre,
          replanificar,
          explicacion: explicarRebote({ nombre: compra.nombre, perdida, estado: nuevo, replanificar, nombresReplan }),
          tx,
        };
        return Response.json(rebote);
      };
      return conChain(
        async (cfg) => {
          let bloque: bigint | undefined;
          const { tx } = await liquidarCheque(cfg, chequeId, "rechazado", (b) => {
            bloque = b;
            alBloque(b);
          });
          // La pérdida se lee de la cadena: lo que el fondo había pagado por el cheque que ahora figura Rechazado.
          const cheque = (await leerEstado(cfg, bloque)).cheques.find((c) => c.id.toLowerCase() === chequeId.toLowerCase());
          const perdida = cheque && cheque.estado === "Rejected" ? unidadesADecimal(cheque.precioCompra.toString()) : compra.precioCompra;
          return armar(tx, perdida);
        },
        () => {
          const { tx, perdida } = rebotarMock(chequeId);
          return armar(tx, perdida);
        },
      );
    }),
  );
}
