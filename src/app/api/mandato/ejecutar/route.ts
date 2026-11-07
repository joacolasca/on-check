// POST { estado, evaluacion, aprobado? } → { ejecucion }. Exige el acceso de la demo (firma con las wallets del servidor).
// El servidor NO confía en el `resultado` que manda el navegador: verifica la firma de la cotización y vuelve a evaluar el mandato
// con el estado firmado. Solo compra si da `comprar` (o `pendiente_aprobacion` con `aprobado: true`). Registra y fondea; si el
// servidor (o, en última instancia, el contrato) rechaza por concentración, industria o liquidez, devuelve `rechazoContrato` y el estado queda igual.
import { ErrorApi, fondearCheque, registrarCheque } from "@/lib/chain";
import { resolverCotizacion } from "@/lib/chain/cotizaciones";
import { leerBandeja } from "@/lib/mandato/bandeja";
import { aplicarCompra, firmarEstado } from "@/lib/mandato/estado";
import { evaluarMandato } from "@/lib/mandato/politica";
import type { ActivoBandeja, CompraMandato, Cotizacion, EjecucionMandato, EstadoMandato } from "@/shared/types";
import { exigirAcceso } from "../../_lib/acceso";
import { conEscritura } from "../../_lib/bloque";
import { conChain } from "../../_lib/chain";
import { error, esIdCheque, leerJson } from "../../_lib/http";
import { conErrorApi, leerEstadoFirmado, siEstaRevocado } from "../../_lib/mandato";
import { comprarMock } from "../../_lib/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Intento = { tx: string } | { rechazo: { codigo: string; mensaje: string } };

/** Lo que revierte el contrato por sus reglas (409) es un rechazo que se registra y se sigue; todo lo demás (red, gas, firma) es un error. */
const esRechazoDelContrato = (e: unknown): e is ErrorApi => e instanceof ErrorApi && e.status === 409 && e.codigo !== "CHEQUE_YA_REGISTRADO";

export async function POST(req: Request) {
  const denegado = exigirAcceso(req);
  if (denegado) return denegado;
  const body = await leerJson(req);
  if (!body) return error("DATOS_INVALIDOS", "Faltan el estado del mandato y la evaluación.");
  const e = leerEstadoFirmado(body.estado);
  if ("respuesta" in e) return e.respuesta;
  const { estado } = e;
  const revocado = siEstaRevocado(estado);
  if (revocado) return revocado;

  const ev = body.evaluacion as { activoId?: unknown; cotizacion?: Cotizacion } | null | undefined;
  if (!ev || typeof ev !== "object" || typeof ev.activoId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(ev.activoId) || !ev.cotizacion || typeof ev.cotizacion !== "object" || !esIdCheque(ev.cotizacion.id)) {
    return error("DATOS_INVALIDOS", "Falta la evaluación del activo (activoId y la cotización firmada).");
  }
  if (body.aprobado !== undefined && typeof body.aprobado !== "boolean") return error("DATOS_INVALIDOS", "aprobado tiene que ser verdadero o falso.");
  const aprobado = body.aprobado === true;
  const activoId = ev.activoId;

  return conErrorApi(async () => {
    // La cotización tiene que ser una que firmó este servidor (en memoria, o con firma válida y hash íntegro).
    let cot: Cotizacion;
    try {
      cot = resolverCotizacion(ev.cotizacion!.id, ev.cotizacion);
    } catch (err) {
      if (err instanceof ErrorApi) return error(err.codigo, err.message, err.status);
      throw err;
    }
    if (estado.compras.some((c) => c.activoId === activoId)) return error("ACTIVO_YA_COMPRADO", "Ese activo ya se compró en este mandato.", 409);

    const delaBandeja = leerBandeja().activos.find((a) => a.id === activoId);
    const activo: ActivoBandeja = { id: activoId, cuit: "", nombre: delaBandeja?.nombre ?? cot.scoring.denominacion ?? activoId, tipo: cot.tipo, nominal: cot.input.nominal, dias: cot.dias };
    const evaluacion = evaluarMandato(activo, cot, estado); // con el estado de AHORA, no con lo que diga el navegador
    if (evaluacion.resultado === "omitir") return error("FUERA_DE_MANDATO", evaluacion.resumen, 409);
    if (evaluacion.resultado === "pendiente_aprobacion" && !aprobado) return error("APROBACION_PENDIENTE", "Este activo necesita tu aprobación: mandá aprobado: true para comprarlo.", 409);

    const resultado = (intento: Intento): Response => {
      if ("rechazo" in intento) {
        const ejecucion: EjecucionMandato = { activoId, estado: firmarEstado(estado), compra: null, rechazoContrato: intento.rechazo };
        return Response.json({ ejecucion });
      }
      const compra: CompraMandato = { activoId, nombre: activo.nombre, libradorHash: cot.libradorHash, chequeId: cot.id, nominal: cot.input.nominal, precioCompra: cot.precioCompra, tx: intento.tx, estado: "Funded" };
      const nuevo: EstadoMandato = firmarEstado(aplicarCompra(estado, compra));
      const ejecucion: EjecucionMandato = { activoId, estado: nuevo, compra, rechazoContrato: null };
      return Response.json({ ejecucion });
    };

    return conEscritura(req, (alBloque) =>
      conChain(
        async (cfg) => {
          try {
            // El servidor controla los límites del fondo (emisor, industria, liquidez) ANTES de registrar: si no entra, no se manda ninguna tx
            // y el cheque no queda Pending. Se registra como rechazo igual que si lo hubiera frenado el contrato, y la corrida sigue.
            await registrarCheque(cfg, cot.id, cot, alBloque);
            const { tx } = await fondearCheque(cfg, cot.id, alBloque); // el contrato repite los mismos límites y es el control final
            return resultado({ tx });
          } catch (err) {
            if (esRechazoDelContrato(err)) return resultado({ rechazo: { codigo: err.codigo, mensaje: err.message } });
            throw err;
          }
        },
        () => {
          try {
            return resultado({ tx: comprarMock(cot).tx });
          } catch (err) {
            if (esRechazoDelContrato(err)) return resultado({ rechazo: { codigo: err.codigo, mensaje: err.message } });
            throw err;
          }
        },
      ),
    );
  });
}
