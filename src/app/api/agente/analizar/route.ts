// Agente gestor (PM) del fondo (D17 y v2). Reemplaza a /api/cotizar en el flujo de /pyme.
// Entrada: cuit, nominal, vencimiento y, opcionales, tipo ("cheque" | "pagare"), garantia y balance (texto). Devuelve ResultadoAgente con la cotización v2.
// Suma `informe` (InformeActivo, lo arma el servidor) al JSON y al evento `resultado`.
// Sin cabecera `accept: application/x-ndjson` devuelve el resultado completo en JSON.
// Con ella, transmite cada paso apenas se produce y al final el resultado (pasos en vivo).
// TODO(confirmar): enchufe definitivo con Rama (docs/INTERFACES.md). Hoy usa los mocks de scoring y de cartera.
import { analizarCheque } from "@/lib/agent";
import { validarExtras } from "@/lib/agent/entrada";
import { herramientasPorDefecto } from "@/lib/agent/herramientas";
import { seleccionarAnalista, seleccionarHerramientas, timeoutDelAnalista } from "@/lib/agent/seleccion";
import { MIME_NDJSON, codificarEvento, type EventoAgente } from "@/lib/agent/stream";
import { guardarCotizacion } from "@/lib/chain";
import type { InputCotizacion } from "@/shared/types";
import { pymeDelServidor } from "../../_lib/chain";
import { informeDe } from "../../_lib/informe";
import { error, esMontoDecimal, esString, leerJson } from "../../_lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // con modelo el análisis tarda ~10 s; en Vercel el límite por defecto es menor

const MENSAJE_FALLO = "No pudimos analizar el cheque ahora. Probá de nuevo en un momento.";

export async function POST(req: Request) {
  const body = await leerJson(req);
  if (!body || !esString(body.cuit) || !esMontoDecimal(body.nominal) || !esString(body.vencimiento)) {
    return error("DATOS_INVALIDOS", "Faltan datos: cuit, nominal y vencimiento.");
  }
  const extras = validarExtras(body);
  if (!extras.ok) return error("DATOS_INVALIDOS", extras.mensaje);
  const input: InputCotizacion = {
    cuit: body.cuit,
    nominal: body.nominal,
    vencimiento: body.vencimiento,
    pyme: esString(body.pyme) ? body.pyme : pymeDelServidor(),
    ...(extras.tipo ? { tipo: extras.tipo } : {}),
    ...(extras.garantia ? { garantia: extras.garantia } : {}),
    ...(extras.balance ? { balance: extras.balance } : {}),
  };
  const analista = seleccionarAnalista();
  const timeoutMs = timeoutDelAnalista(analista);
  const herramientas = seleccionarHerramientas();
  const herramientasRespaldo = herramientasPorDefecto(); // si el modelo falla, se sigue sin modelo

  if (!(req.headers.get("accept") ?? "").includes(MIME_NDJSON)) {
    try {
      const r = await analizarCheque(input, { analista, timeoutMs, herramientas, herramientasRespaldo });
      guardarCotizacion(r.cotizacion);
      const informe = informeDe(r);
      return Response.json(informe ? { ...r, informe } : r);
    } catch {
      return error("ANALISIS_FALLIDO", MENSAJE_FALLO, 502);
    }
  }

  const codificador = new TextEncoder();
  const flujo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const emitir = (e: EventoAgente) => controlador.enqueue(codificador.encode(codificarEvento(e)));
      try {
        const resultado = await analizarCheque(input, {
          analista,
          timeoutMs,
          herramientas,
          herramientasRespaldo,
          onPaso: (paso) => emitir({ tipo: "paso", paso }),
          onReinicio: () => emitir({ tipo: "reinicio" }),
        });
        guardarCotizacion(resultado.cotizacion);
        emitir({ tipo: "resultado", resultado, informe: informeDe(resultado) });
      } catch {
        emitir({ tipo: "error", codigo: "ANALISIS_FALLIDO", mensaje: MENSAJE_FALLO });
      } finally {
        controlador.close();
      }
    },
  });
  return new Response(flujo, { headers: { "content-type": `${MIME_NDJSON}; charset=utf-8`, "cache-control": "no-store" } });
}
