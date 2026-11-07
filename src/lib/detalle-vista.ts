// Textos y mapeos puros de la pantalla de detalle del activo (así se pueden probar sin render).
import { formatBps } from "./format";
import type { ReglaInforme } from "./agent/informe";

/** Resultado de una regla: true cumple, false no cumple, null no se evaluó o no se pudo verificar. */
export function etiquetaCumple(cumple: boolean | null): string {
  return cumple === null ? "Sin evaluar" : cumple ? "Cumple" : "No cumple";
}

export const NOTA_SIN_INFORME =
  "El informe completo del agente analista ya no está disponible en este servidor ni en este navegador. Mostramos lo que quedó registrado on-chain.";

export const MENSAJE_NO_ENCONTRADO = "No encontramos ese activo.";

/** Ajuste de puntaje con signo tipográfico: "−15", "+5", "0". */
export function puntosConSigno(puntos: number): string {
  return `${puntos > 0 ? "+" : puntos < 0 ? "−" : ""}${Math.abs(puntos)}`;
}

/** "35 % anual · 60 días". */
export const tasaYPlazo = (tasaTnaBps: number, dias: number): string => `${formatBps(tasaTnaBps)} anual · ${dias} días`;

/** Separa las reglas que verificó el sistema al cotizar de las que hace cumplir el contrato al comprar. */
export function separarReglas(reglas: ReglaInforme[]): { sistema: ReglaInforme[]; contrato: ReglaInforme[] } {
  return { sistema: reglas.filter((r) => r.verifica === "sistema"), contrato: reglas.filter((r) => r.verifica === "contrato") };
}

/** Ruta del detalle de un activo. */
export const rutaDetalle = (id: string): string => `/cheques/${id}`;
