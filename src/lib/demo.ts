// Lógica de presentación de /demo ("adelantar tiempo"). Sin React.
import type { ChequeVista } from "@/shared/types";

export type ResultadoLiquidacion = "pagado" | "rechazado";

/** Solo un cheque Funded se puede pagar o rechazar. */
export const chequesLiquidables = (cheques: ChequeVista[]): ChequeVista[] =>
  cheques.filter((c) => c.estado === "Funded");

export function resumenPorEstado(cheques: ChequeVista[]): Record<ChequeVista["estado"], number> {
  const r = { Pending: 0, Funded: 0, Paid: 0, Rejected: 0 };
  for (const c of cheques) r[c.estado] += 1;
  return r;
}

/** Un rescate que el gestor liquidó (o salteó) en `POST /api/demo/rescates/liquidar`. */
export interface DetalleRescate {
  id: string;
  cuotapartes: string | null;
  monto: string | null;
  tx: string | null;
  motivo: string | null; // por qué se salteó, si corresponde
}

export interface ResultadoRescates {
  liquidados: DetalleRescate[];
  salteados: DetalleRescate[];
  explicacion: string | null; // explicación del gestor: liquidez vs. rescates, impacto en la reserva del 15 %
}

const texto = (x: unknown): string | null => (typeof x === "string" ? x : typeof x === "number" ? String(x) : null);

function lista(x: unknown): DetalleRescate[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
    .map((d) => ({ id: texto(d.id) ?? "?", cuotapartes: texto(d.cuotapartes), monto: texto(d.monto), tx: texto(d.tx), motivo: texto(d.motivo) }));
}

/**
 * Lee la respuesta de la liquidación sin asumir de más (la forma exacta la define la API):
 * espera `{ liquidados: [...], omitidos: [...], explicacionGestor: string }` (acepta también `salteados` y `explicacion`).
 */
export function leerResultadoRescates(x: unknown): ResultadoRescates {
  const o = typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {};
  return { liquidados: lista(o.liquidados), salteados: lista(o.salteados ?? o.omitidos), explicacion: texto(o.explicacionGestor ?? o.explicacion) };
}

export const textoResultado = (r: ResultadoLiquidacion): string =>
  r === "pagado" ? "El librador pagó: el cheque pasa a Pagado y el fondo cobra el nominal." : "El cheque rebotó: pasa a Rechazado y la pérdida queda pública.";
