// POST { estado, cotizacion, activo: { id, nombre } } → { evaluacion }. Sin modelo, sin cadena, sin acceso de la demo: milisegundos.
// Es la mitad "que depende del estado" del análisis: el navegador analiza los activos en paralelo (POST /api/agente/mandato con
// soloAnalisis) y después, en el orden de la bandeja, evalúa cada uno con el estado vigente. El servidor verifica la firma del estado
// y la firma/hash de la cotización (igual que /ejecutar); /ejecutar vuelve a evaluar con el estado firmado antes de comprar.
import { ErrorApi } from "@/lib/chain";
import { resolverCotizacion } from "@/lib/chain/cotizaciones";
import { evaluarMandato } from "@/lib/mandato/politica";
import type { RespuestaEvaluar } from "@/lib/mandato/tipos";
import type { ActivoBandeja, Cotizacion } from "@/shared/types";
import { error, esIdCheque, leerJson } from "../../_lib/http";
import { conErrorApi, leerEstadoFirmado, siEstaRevocado } from "../../_lib/mandato";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await leerJson(req);
  if (!body) return error("DATOS_INVALIDOS", "Faltan el estado del mandato, la cotización y el activo.");
  const e = leerEstadoFirmado(body.estado);
  if ("respuesta" in e) return e.respuesta;
  const { estado } = e;
  const revocado = siEstaRevocado(estado);
  if (revocado) return revocado;

  const a = body.activo as { id?: unknown; nombre?: unknown } | null | undefined;
  if (!a || typeof a !== "object" || typeof a.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(a.id) || typeof a.nombre !== "string" || a.nombre.trim() === "" || a.nombre.length > 100) {
    return error("DATOS_INVALIDOS", "Falta el activo: id (letras, números, guion y guion bajo) y nombre de hasta 100 caracteres.");
  }
  const id = a.id;
  const nombre = a.nombre.trim();
  const cotizacion = body.cotizacion as Cotizacion | null | undefined;
  if (!cotizacion || typeof cotizacion !== "object" || !esIdCheque(cotizacion.id)) return error("DATOS_INVALIDOS", "Falta la cotización firmada del activo.");

  return conErrorApi(() => {
    let cot: Cotizacion;
    try {
      cot = resolverCotizacion(cotizacion.id, cotizacion); // en memoria, o con firma válida y hash íntegro
    } catch (err) {
      if (err instanceof ErrorApi) return error(err.codigo, err.message, err.status);
      throw err;
    }
    // Tipo, plazo y nominal salen de la cotización firmada; el activo solo aporta id y nombre.
    const activo: ActivoBandeja = { id, cuit: "", nombre, tipo: cot.tipo, nominal: cot.input.nominal, dias: cot.dias };
    const respuesta: RespuestaEvaluar = { evaluacion: evaluarMandato(activo, cot, estado) };
    return Response.json(respuesta);
  });
}
