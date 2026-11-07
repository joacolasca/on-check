// Validación de un activo de la bandeja (o del "CUIT sorpresa") que llega de afuera, y su vencimiento a partir de los días.
import { validarExtras } from "@/lib/agent/entrada";
import { fechaHoyBA } from "@/lib/scoring/puntaje";
import { aCentavos } from "@/lib/scoring/dinero";
import type { ActivoBandeja } from "@/shared/types";
import { esMontoMandato } from "./politica";

export type ResultadoActivo = { ok: true; activo: ActivoBandeja } | { ok: false; mensaje: string };

/** CUIT con o sin guiones → 11 dígitos; null si no tiene esa forma. */
export function normalizarCuit(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const limpio = v.replace(/-/g, "");
  return /^\d{11}$/.test(limpio) ? limpio : null;
}

/** Valida y normaliza un activo: tipos, largos y decimales. La garantía y el balance usan las mismas reglas que /api/agente/analizar. */
export function validarActivo(x: unknown): ResultadoActivo {
  const no = (mensaje: string): ResultadoActivo => ({ ok: false, mensaje });
  if (x === null || typeof x !== "object" || Array.isArray(x)) return no("El activo tiene que ser un objeto.");
  const a = x as Record<string, unknown>;
  if (typeof a.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(a.id)) return no("El id del activo tiene que ser texto de hasta 64 caracteres (letras, números, guion y guion bajo).");
  const cuit = normalizarCuit(a.cuit);
  if (!cuit) return no("El CUIT tiene que tener 11 dígitos.");
  if (typeof a.nombre !== "string" || a.nombre.trim() === "" || a.nombre.length > 100) return no("El nombre del activo es obligatorio y no puede pasar de 100 caracteres.");
  if (a.tipo !== "cheque" && a.tipo !== "pagare") return no('El tipo tiene que ser "cheque" o "pagare".');
  if (!esMontoMandato(a.nominal) || aCentavos(a.nominal) <= 0n) return no("El nominal tiene que ser un monto en pesos mayor a cero, como texto decimal.");
  if (typeof a.dias !== "number" || !Number.isInteger(a.dias) || a.dias < 1 || a.dias > 365) return no("Los días tienen que ser un entero de 1 a 365.");
  if (a.nota !== undefined && (typeof a.nota !== "string" || a.nota.length > 500)) return no("La nota tiene que ser texto de hasta 500 caracteres.");
  if (a.reboteSimulado !== undefined && typeof a.reboteSimulado !== "boolean") return no("reboteSimulado tiene que ser verdadero o falso.");
  const extras = validarExtras({ garantia: a.garantia, balance: a.balance });
  if (!extras.ok) return no(extras.mensaje);
  return {
    ok: true,
    activo: {
      id: a.id,
      cuit,
      nombre: a.nombre.trim(),
      tipo: a.tipo,
      nominal: a.nominal,
      dias: a.dias,
      ...(extras.garantia ? { garantia: extras.garantia } : {}),
      ...(extras.balance ? { balance: extras.balance } : {}),
      ...(typeof a.nota === "string" ? { nota: a.nota } : {}),
      ...(a.reboteSimulado === true ? { reboteSimulado: true } : {}),
    },
  };
}

/** AAAA-MM-DD en Buenos Aires, `dias` después de hoy: el vencimiento del activo para cotizar. */
export const vencimientoEn = (dias: number, ahora: Date = new Date()): string => fechaHoyBA(new Date(ahora.getTime() + dias * 86_400_000));
