// Eventos de POST /api/agente/mandato (NDJSON): los mismos pasos que /api/agente/analizar y un evento final `evaluacion`.
// No se agrega `resultado`: el cliente de /analizar corta al verlo y se perdería la evaluación.
import { codificarEvento, parsearEvento, type EventoAgente } from "@/lib/agent/stream";
import type { Cotizacion, EvaluacionMandato } from "@/shared/types";

export type EventoMandato =
  | Extract<EventoAgente, { tipo: "paso" | "reinicio" | "error" }>
  | { tipo: "evaluacion"; evaluacion: EvaluacionMandato }
  | { tipo: "analisis"; cotizacion: Cotizacion }; // con `soloAnalisis: true`: la cotización firmada, sin evaluar el mandato

export const codificarEventoMandato = (e: EventoMandato): string => codificarEvento(e as EventoAgente);

/** Igual que `parsearEvento` del agente, pero acepta además el evento `evaluacion`. */
export function parsearEventoMandato(linea: string): EventoMandato {
  const x: unknown = JSON.parse(linea);
  const tipo = typeof x === "object" && x !== null ? (x as { tipo?: unknown }).tipo : undefined;
  if (tipo === "evaluacion" || tipo === "analisis") return x as EventoMandato;
  const e = parsearEvento(linea);
  if (e.tipo === "resultado") throw new Error("El mandato no emite el evento resultado.");
  return e;
}
