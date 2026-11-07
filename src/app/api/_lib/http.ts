// Helpers de las rutas MOCK. Rama los puede reutilizar en las rutas reales.
import type { ApiError } from "@/shared/types";

export function error(codigo: string, mensaje: string, status = 400): Response {
  const cuerpo: ApiError = { error: { codigo, mensaje } };
  return Response.json(cuerpo, { status });
}

export async function leerJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const cuerpo: unknown = await req.json();
    return cuerpo !== null && typeof cuerpo === "object" && !Array.isArray(cuerpo)
      ? (cuerpo as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const esString = (v: unknown): v is string => typeof v === "string" && v.length > 0;
export const esMontoDecimal = (v: unknown): v is string =>
  typeof v === "string" && /^\d+(\.\d+)?$/.test(v) && Number(v) > 0;

/** Id de cheque / cotización: bytes32 en hex. */
export const esIdCheque = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
/** AAAA-MM-DD que además es una fecha real (el 2027-02-30 no). */
export function esFechaReal(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10) === v;
}

export const TX_FALSA = "0x" + "ab".repeat(32);
// Id de cheque que en el mock simula el rechazo por concentración (para probar el error en la UI).
export const ID_CONCENTRACION = "0x" + "0".repeat(60) + "dead";
