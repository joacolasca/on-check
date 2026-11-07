// Lógica de presentación del panel público: proporciones y filtros. Sin React.
import type { ChequeVista, EstadoCheque } from "@/shared/types";

export type FiltroCheques = "todos" | EstadoCheque;

/** Decimal en string → bigint escalado a 6 decimales (trunca). Sin pasar por `number`. */
function escalar(valor: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(valor)) throw new Error(`Monto inválido: ${valor}`);
  const [e, f = ""] = valor.split(".");
  return BigInt(e + f.padEnd(6, "0").slice(0, 6));
}

/** Qué parte del total es `parte`, en basis points (0–10000). Total 0 → 0. */
export function proporcionBps(parte: string, total: string): number {
  const t = escalar(total);
  if (t === 0n) return 0;
  const bps = (escalar(parte) * 10000n) / t;
  return Number(bps > 10000n ? 10000n : bps);
}

export function filtrarCheques(cheques: ChequeVista[], filtro: FiltroCheques): ChequeVista[] {
  return filtro === "todos" ? cheques : cheques.filter((c) => c.estado === filtro);
}

export function contarPorFiltro(cheques: ChequeVista[]): Record<FiltroCheques, number> {
  const r: Record<FiltroCheques, number> = { todos: cheques.length, Pending: 0, Funded: 0, Paid: 0, Rejected: 0 };
  for (const c of cheques) r[c.estado] += 1;
  return r;
}

export const FILTROS: { id: FiltroCheques; etiqueta: string }[] = [
  { id: "todos", etiqueta: "Todos" },
  { id: "Pending", etiqueta: "Pendientes" },
  { id: "Funded", etiqueta: "Fondeados" },
  { id: "Paid", etiqueta: "Pagados" },
  { id: "Rejected", etiqueta: "Rechazados" },
];

/** Ancho de una barra de progreso en %, acotado a 0–100, con un decimal máximo. */
export function anchoBarra(bps: number): number {
  return Math.min(100, Math.max(0, Math.round(bps / 10) / 10));
}

/** Nota que acompaña a la TIR: aclara qué mide, y por qué un rebote da cifras extremas (se anualiza sobre el plazo corto del cheque). */
export function notaTir(bps: number | null): string {
  if (bps === null) return "Todavía no hay cheques cerrados";
  if (bps < 0) return "Negativa: hubo pérdidas. Se anualiza sobre el plazo del cheque, por eso un rebote da cifras extremas.";
  return "Anualizada sobre el plazo de los cheques cerrados";
}
