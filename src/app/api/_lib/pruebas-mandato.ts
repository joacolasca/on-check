// SOLO para tests: llama a las rutas del Mandato como lo haría la pantalla y corre la bandeja completa (usado por el test en mock y el de anvil).
import { MIME_NDJSON } from "@/lib/agent/stream";
import { parsearEventoMandato, type EventoMandato } from "@/lib/mandato/stream";
import type { ActivoBandeja, Cotizacion, EjecucionMandato, EstadoMandato, EvaluacionMandato, Mandato, ReboteMandato } from "@/shared/types";

export const CLAVE_PRUEBA = "clave-de-prueba-0123456789";
export const AUTH = { "content-type": "application/json", "x-demo-clave": CLAVE_PRUEBA };
export const SIN_AUTH = { "content-type": "application/json" };

export type RutaMandato = "iniciar" | "ejecutar" | "rebote" | "revocar" | "agente" | "evaluar";

export async function llamar(ruta: RutaMandato, body: unknown, cabeceras: Record<string, string> = AUTH, accept?: string): Promise<Response> {
  const modulo =
    ruta === "agente" ? await import("../agente/mandato/route") : ruta === "iniciar" ? await import("../mandato/iniciar/route") : ruta === "evaluar" ? await import("../mandato/evaluar/route") : ruta === "ejecutar" ? await import("../mandato/ejecutar/route") : ruta === "rebote" ? await import("../mandato/rebote/route") : await import("../mandato/revocar/route");
  const url = ruta === "agente" ? "http://localhost/api/agente/mandato" : `http://localhost/api/mandato/${ruta}`;
  return modulo.POST(new Request(url, { method: "POST", headers: { ...cabeceras, ...(accept ? { accept } : {}) }, body: JSON.stringify(body) }));
}

export const json = async <T>(r: Response): Promise<T> => (await r.json()) as T;
export const errorDe = async (r: Response) => (await json<{ error: { codigo: string; mensaje: string } }>(r)).error;

export async function iniciar(mandato: Mandato): Promise<EstadoMandato> {
  const r = await llamar("iniciar", { mandato });
  if (r.status !== 200) throw new Error(`iniciar → ${r.status}: ${JSON.stringify(await r.json())}`);
  return (await json<{ estado: EstadoMandato }>(r)).estado;
}

/** Analiza un activo (NDJSON) y devuelve los eventos y la evaluación final. */
export async function analizarActivo(estado: EstadoMandato, activo: ActivoBandeja): Promise<{ eventos: EventoMandato[]; evaluacion: EvaluacionMandato }> {
  const r = await llamar("agente", { estado, activo }, SIN_AUTH, MIME_NDJSON);
  if (r.status !== 200) throw new Error(`agente/mandato → ${r.status}: ${JSON.stringify(await r.json())}`);
  const eventos = (await r.text()).split("\n").filter((l) => l.trim() !== "").map(parsearEventoMandato);
  const final = eventos[eventos.length - 1];
  if (final?.tipo !== "evaluacion") throw new Error(`El último evento no fue la evaluación: ${JSON.stringify(final)}`);
  return { eventos, evaluacion: final.evaluacion };
}

/** Solo el análisis de un activo (`soloAnalisis: true`, NDJSON): los eventos y la cotización firmada, sin evaluar el mandato. */
export async function analizarSoloAnalisis(estado: EstadoMandato, activo: ActivoBandeja): Promise<{ eventos: EventoMandato[]; cotizacion: Cotizacion }> {
  const r = await llamar("agente", { estado, activo, soloAnalisis: true }, SIN_AUTH, MIME_NDJSON);
  if (r.status !== 200) throw new Error(`agente/mandato (soloAnalisis) → ${r.status}: ${JSON.stringify(await r.json())}`);
  const eventos = (await r.text()).split("\n").filter((l) => l.trim() !== "").map(parsearEventoMandato);
  const final = eventos[eventos.length - 1];
  if (final?.tipo !== "analisis") throw new Error(`El último evento no fue el análisis: ${JSON.stringify(final)}`);
  return { eventos, cotizacion: final.cotizacion };
}

/** `POST /api/mandato/evaluar`: la parte del análisis que depende del estado. */
export const evaluarConEstado = (estado: unknown, cotizacion: Cotizacion, activo: { id: string; nombre: string }) => llamar("evaluar", { estado, cotizacion, activo }, SIN_AUTH);

export interface Corrida {
  estado: EstadoMandato;
  evaluaciones: EvaluacionMandato[];
  ejecuciones: EjecucionMandato[];
}

/** Recorre los activos en orden: analiza, evalúa y, si el mandato dice `comprar`, ejecuta. */
export async function correrActivos(estadoInicial: EstadoMandato, activos: ActivoBandeja[], previa?: Corrida): Promise<Corrida> {
  const c: Corrida = previa ?? { estado: estadoInicial, evaluaciones: [], ejecuciones: [] };
  for (const activo of activos) {
    const { evaluacion } = await analizarActivo(c.estado, activo);
    c.evaluaciones.push(evaluacion);
    if (evaluacion.resultado !== "comprar") continue;
    const r = await llamar("ejecutar", { estado: c.estado, evaluacion });
    if (r.status !== 200) throw new Error(`ejecutar ${activo.id} → ${r.status}: ${JSON.stringify(await r.json())}`);
    const { ejecucion } = await json<{ ejecucion: EjecucionMandato }>(r);
    c.ejecuciones.push(ejecucion);
    c.estado = ejecucion.estado;
  }
  return c;
}

export async function rebotar(estado: EstadoMandato, chequeId: string, evaluaciones?: EvaluacionMandato[]): Promise<Response> {
  return llamar("rebote", { estado, chequeId, ...(evaluaciones ? { evaluaciones } : {}) });
}
export const comoRebote = (r: Response) => json<ReboteMandato>(r);
