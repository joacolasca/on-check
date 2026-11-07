// Formato de los pasos en vivo: NDJSON (un evento JSON por línea). Lo usan la ruta y el cliente.
import type { InformeActivo } from "./informe";
import type { PasoAgente, ResultadoAgente } from "./types";

export const MIME_NDJSON = "application/x-ndjson";

export type EventoAgente =
  | { tipo: "paso"; paso: PasoAgente }
  | { tipo: "reinicio" }
  | { tipo: "resultado"; resultado: ResultadoAgente; informe?: InformeActivo }
  | { tipo: "error"; codigo: string; mensaje: string };

export const codificarEvento = (e: EventoAgente): string => `${JSON.stringify(e)}\n`;

/** Junta lo que llegó con lo que había a medias y devuelve las líneas completas y el resto. */
export function separarLineas(pendiente: string, chunk: string): { lineas: string[]; resto: string } {
  const partes = (pendiente + chunk).split("\n");
  const resto = partes.pop() ?? "";
  return { lineas: partes.filter((l) => l.trim() !== ""), resto };
}

export function parsearEvento(linea: string): EventoAgente {
  const x: unknown = JSON.parse(linea);
  if (typeof x !== "object" || x === null || !("tipo" in x)) throw new Error("Evento inválido");
  const e = x as { tipo: unknown };
  if (e.tipo === "paso" || e.tipo === "reinicio" || e.tipo === "resultado" || e.tipo === "error") return x as EventoAgente;
  throw new Error(`Evento desconocido: ${String(e.tipo)}`);
}
