// Un activo del Mandato por llamada: el gestor lo analiza (mismos pasos en vivo que /api/agente/analizar) y el servidor evalúa
// las 11 reglas del mandato (fijas, sin modelo). Evento final: { tipo: "evaluacion", evaluacion }. No escribe en la cadena.
// Con `soloAnalisis: true` el evento final es { tipo: "analisis", cotizacion } (sin evaluar el mandato, porque el estado de ese momento
// puede quedar viejo): el navegador lanza varios análisis en paralelo y evalúa después, en orden, con POST /api/mandato/evaluar.
// Sin `accept: application/x-ndjson` devuelve { evaluacion, pasos } en JSON.
import { analizarCheque } from "@/lib/agent";
import { herramientasPorDefecto } from "@/lib/agent/herramientas";
import { seleccionarAnalista, seleccionarHerramientas, timeoutDelAnalista } from "@/lib/agent/seleccion";
import { MIME_NDJSON } from "@/lib/agent/stream";
import { guardarCotizacion } from "@/lib/chain";
import { validarActivo, vencimientoEn } from "@/lib/mandato/activo";
import { evaluarMandato } from "@/lib/mandato/politica";
import { codificarEventoMandato, type EventoMandato } from "@/lib/mandato/stream";
import type { InputCotizacion } from "@/shared/types";
import { pymeDelServidor } from "../../_lib/chain";
import { informeDe } from "../../_lib/informe";
import { error, leerJson } from "../../_lib/http";
import { leerEstadoFirmado, siEstaRevocado } from "../../_lib/mandato";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MENSAJE_FALLO = "No pudimos analizar el activo ahora. Probá de nuevo en un momento.";

export async function POST(req: Request) {
  const body = await leerJson(req);
  if (!body) return error("DATOS_INVALIDOS", "Faltan el estado del mandato y el activo.");
  const e = leerEstadoFirmado(body.estado);
  if ("respuesta" in e) return e.respuesta;
  const a = validarActivo(body.activo);
  if (!a.ok) return error("DATOS_INVALIDOS", a.mensaje);
  if (body.soloAnalisis !== undefined && typeof body.soloAnalisis !== "boolean") return error("DATOS_INVALIDOS", "soloAnalisis tiene que ser verdadero o falso.");
  const soloAnalisis = body.soloAnalisis === true;
  const revocado = siEstaRevocado(e.estado);
  if (revocado) return revocado;
  const { estado } = e;
  const { activo } = a;

  const input: InputCotizacion = {
    cuit: activo.cuit,
    nominal: activo.nominal,
    vencimiento: vencimientoEn(activo.dias),
    pyme: pymeDelServidor(),
    tipo: activo.tipo,
    ...(activo.garantia ? { garantia: activo.garantia } : {}),
    ...(activo.balance ? { balance: activo.balance } : {}),
  };
  const analista = seleccionarAnalista();
  const timeoutMs = timeoutDelAnalista(analista);
  const herramientas = seleccionarHerramientas();
  const herramientasRespaldo = herramientasPorDefecto();

  if (!(req.headers.get("accept") ?? "").includes(MIME_NDJSON)) {
    try {
      const r = await analizarCheque(input, { analista, timeoutMs, herramientas, herramientasRespaldo });
      guardarCotizacion(r.cotizacion);
      informeDe(r); // queda para el detalle del activo si el mandato lo compra
      return Response.json(soloAnalisis ? { cotizacion: r.cotizacion, pasos: r.pasos } : { evaluacion: evaluarMandato(activo, r.cotizacion, estado), pasos: r.pasos });
    } catch {
      return error("ANALISIS_FALLIDO", MENSAJE_FALLO, 502);
    }
  }

  const codificador = new TextEncoder();
  const flujo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const emitir = (ev: EventoMandato) => controlador.enqueue(codificador.encode(codificarEventoMandato(ev)));
      try {
        const resultado = await analizarCheque(input, {
          analista,
          timeoutMs,
          herramientas,
          herramientasRespaldo,
          onPaso: (paso) => emitir({ tipo: "paso", paso }),
          onReinicio: () => emitir({ tipo: "reinicio" }),
        });
        guardarCotizacion(resultado.cotizacion); // la deja firmada: /ejecutar la verifica antes de registrar
        informeDe(resultado);
        emitir(soloAnalisis ? { tipo: "analisis", cotizacion: resultado.cotizacion } : { tipo: "evaluacion", evaluacion: evaluarMandato(activo, resultado.cotizacion, estado) });
      } catch {
        emitir({ tipo: "error", codigo: "ANALISIS_FALLIDO", mensaje: MENSAJE_FALLO });
      } finally {
        controlador.close();
      }
    },
  });
  return new Response(flujo, { headers: { "content-type": `${MIME_NDJSON}; charset=utf-8`, "cache-control": "no-store" } });
}
