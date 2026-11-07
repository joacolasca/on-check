// Cliente de las rutas del mandato. La UI habla solo con esto; el `fetch` se inyecta para poder testear con un backend falso.
import type {
  ActivoBandeja,
  ApiError,
  Cotizacion,
  EjecucionMandato,
  EstadoMandato,
  EvaluacionMandato,
  Mandato,
  ReboteMandato,
  ResumenFondo,
} from "@/shared/types";
import { ApiClientError } from "./api-client";
import type { PasoAgente } from "./agent/types";
import { MIME_NDJSON, parsearEvento, separarLineas } from "./agent/stream";
import type { RespuestaEvaluar } from "./mandato/tipos";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface Bandeja {
  activos: ActivoBandeja[];
  mandatoPorDefecto: Mandato;
}

export interface ManejadoresPasos {
  onPaso: (p: PasoAgente) => void;
  onReinicio: () => void;
}

/** Todo lo que la corrida necesita del servidor. En producción es `crearClienteMandato(fetch)`; en tests, un backend falso. */
export interface ClienteMandato {
  bandeja(): Promise<Bandeja>;
  fondo(): Promise<ResumenFondo>;
  iniciar(mandato: Mandato): Promise<EstadoMandato>;
  /** Lo lento (gestor + scoring + cotización): no depende del estado del mandato, se puede lanzar en paralelo. `soloAnalisis: true`. */
  analizar(estado: EstadoMandato, activo: ActivoBandeja, h: ManejadoresPasos, signal?: AbortSignal): Promise<Cotizacion>;
  /** Lo que depende del estado (presupuesto, tope por emisor, bloqueos, revocación): instantáneo y sin modelo. `POST /api/mandato/evaluar`. */
  evaluar(estado: EstadoMandato, activo: ActivoBandeja, cotizacion: Cotizacion): Promise<EvaluacionMandato>;
  ejecutar(estado: EstadoMandato, evaluacion: EvaluacionMandato, aprobado?: boolean): Promise<EjecucionMandato>;
  rebote(estado: EstadoMandato, chequeId: string): Promise<ReboteMandato>;
  revocar(estado: EstadoMandato): Promise<EstadoMandato>;
}

const ERROR_RED = () => new ApiClientError("RED", "No pudimos conectar con el servidor. Revisá tu conexión y reintentá.", 0);

function leerError(cuerpo: unknown): { codigo: string; mensaje: string } | null {
  const e = (cuerpo as Partial<ApiError> | null)?.error;
  return e && typeof e === "object" && "codigo" in e && "mensaje" in e ? { codigo: String(e.codigo), mensaje: String(e.mensaje) } : null;
}

async function errorDeRespuesta(res: Response): Promise<ApiClientError> {
  let cuerpo: unknown;
  try {
    cuerpo = await res.json();
  } catch {
    return new ApiClientError("RESPUESTA_INVALIDA", "El servidor respondió algo que no entendimos.", res.status);
  }
  const e = leerError(cuerpo);
  return new ApiClientError(e?.codigo ?? "ERROR_HTTP", e?.mensaje ?? `El servidor respondió con error ${res.status}.`, res.status);
}

type EventoMandato = { tipo: "evaluacion"; evaluacion: EvaluacionMandato } | { tipo: "analisis"; cotizacion: Cotizacion } | ReturnType<typeof parsearEvento>;

/** Los eventos de pasos son los de /api/agente/analizar; el final es `{ tipo: "evaluacion", evaluacion }` o, con `soloAnalisis`, `{ tipo: "analisis", cotizacion }`. */
export function parsearEventoMandato(linea: string): EventoMandato {
  const x: unknown = JSON.parse(linea);
  const tipo = typeof x === "object" && x !== null ? (x as { tipo?: unknown }).tipo : undefined;
  if (tipo === "evaluacion" || tipo === "analisis") return x as EventoMandato;
  return parsearEvento(linea);
}

export function crearClienteMandato(fetchFn: FetchFn): ClienteMandato {
  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetchFn(path, init);
    } catch {
      throw ERROR_RED();
    }
    if (!res.ok) throw await errorDeRespuesta(res);
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiClientError("RESPUESTA_INVALIDA", "El servidor respondió algo que no entendimos.", res.status);
    }
  }
  const post = <T>(path: string, body: unknown) =>
    json<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  return {
    bandeja: () => json<Bandeja>("/api/mandato/bandeja", { cache: "no-store" }),
    fondo: () => json<ResumenFondo>("/api/fondo", { cache: "no-store" }),
    iniciar: async (mandato) => (await post<{ estado: EstadoMandato }>("/api/mandato/iniciar", { mandato })).estado,
    ejecutar: async (estado, evaluacion, aprobado) =>
      (await post<{ ejecucion: EjecucionMandato }>("/api/mandato/ejecutar", { estado, evaluacion, ...(aprobado ? { aprobado: true } : {}) })).ejecucion,
    rebote: (estado, chequeId) => post<ReboteMandato>("/api/mandato/rebote", { estado, chequeId }),
    revocar: async (estado) => (await post<{ estado: EstadoMandato }>("/api/mandato/revocar", { estado })).estado,

    evaluar: async (estado, activo, cotizacion) =>
      (await post<RespuestaEvaluar>("/api/mandato/evaluar", { estado, cotizacion, activo: { id: activo.id, nombre: activo.nombre } })).evaluacion,

    async analizar(estado, activo, h, signal) {
      let res: Response;
      try {
        res = await fetchFn("/api/agente/mandato", {
          method: "POST",
          headers: { "content-type": "application/json", accept: MIME_NDJSON },
          body: JSON.stringify({ estado, activo, soloAnalisis: true }),
          ...(signal ? { signal } : {}),
        });
      } catch {
        throw ERROR_RED();
      }
      if (!res.ok || !res.body) throw await errorDeRespuesta(res);

      const lector = res.body.getReader();
      const decodificador = new TextDecoder();
      let resto = "";
      try {
        for (;;) {
          const { done, value } = await lector.read();
          const { lineas, resto: nuevo } = separarLineas(resto, done ? "\n" : decodificador.decode(value, { stream: true }));
          resto = nuevo;
          for (const linea of lineas) {
            const ev = parsearEventoMandato(linea);
            if (ev.tipo === "paso") h.onPaso(ev.paso);
            else if (ev.tipo === "reinicio") h.onReinicio();
            else if (ev.tipo === "analisis") return ev.cotizacion;
            else if (ev.tipo === "error") throw new ApiClientError(ev.codigo, ev.mensaje, res.status);
          }
          if (done) break;
        }
      } catch (e) {
        if (e instanceof ApiClientError) throw e;
        throw ERROR_RED();
      }
      throw new ApiClientError("ANALISIS_INCOMPLETO", "El análisis se cortó antes de terminar. Probá de nuevo.", res.status);
    },
  };
}
