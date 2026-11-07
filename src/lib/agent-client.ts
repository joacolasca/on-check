// Cliente de /api/agente/analizar con pasos en vivo. La UI habla solo con esto.
import type { ApiError, InputCotizacion } from "@/shared/types";
import { ApiClientError } from "./api-client";
import type { InformeActivo } from "./agent/informe";
import type { PasoAgente, ResultadoAgente } from "./agent/types";
import { MIME_NDJSON, parsearEvento, separarLineas } from "./agent/stream";

export interface ManejadoresVivo {
  onPaso: (p: PasoAgente) => void;
  onReinicio: () => void;
}

const ERROR_RED = new ApiClientError("RED", "No pudimos conectar con el servidor. Revisá tu conexión y reintentá.", 0);

/** El resultado del agente más el informe del activo (lo arma el servidor). */
export type ResultadoConInforme = ResultadoAgente & { informe?: InformeActivo };

export type EntradaCotizacion = Omit<InputCotizacion, "pyme"> & { pyme?: string };

/** La wallet de la pyme la pone el servidor: la UI no la manda. */
export async function analizarEnVivo(input: EntradaCotizacion, h: ManejadoresVivo): Promise<ResultadoConInforme> {
  let res: Response;
  try {
    res = await fetch("/api/agente/analizar", {
      method: "POST",
      headers: { "content-type": "application/json", accept: MIME_NDJSON },
      body: JSON.stringify(input),
    });
  } catch {
    throw ERROR_RED;
  }

  if (!res.ok || !res.body) {
    let cuerpo: unknown;
    try {
      cuerpo = await res.json();
    } catch {
      throw new ApiClientError("RESPUESTA_INVALIDA", "El servidor respondió algo que no entendimos.", res.status);
    }
    const e = (cuerpo as Partial<ApiError>).error;
    throw new ApiClientError(e?.codigo ?? "ERROR_HTTP", e?.mensaje ?? `El servidor respondió con error ${res.status}.`, res.status);
  }

  const lector = res.body.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  try {
    for (;;) {
      const { done, value } = await lector.read();
      const texto = done ? "" : decodificador.decode(value, { stream: true });
      const { lineas, resto: nuevoResto } = separarLineas(resto, done ? "\n" : texto);
      resto = nuevoResto;
      for (const linea of lineas) {
        const ev = parsearEvento(linea);
        if (ev.tipo === "paso") h.onPaso(ev.paso);
        else if (ev.tipo === "reinicio") h.onReinicio();
        else if (ev.tipo === "resultado") return ev.informe ? { ...ev.resultado, informe: ev.informe } : ev.resultado;
        else throw new ApiClientError(ev.codigo, ev.mensaje, res.status);
      }
      if (done) break;
    }
  } catch (e) {
    if (e instanceof ApiClientError) throw e;
    throw ERROR_RED;
  }
  throw new ApiClientError("ANALISIS_INCOMPLETO", "El análisis se cortó antes de terminar. Probá de nuevo.", res.status);
}
