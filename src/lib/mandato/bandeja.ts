// La bandeja de la demo: shared/fixtures/mandato-bandeja.json, validada al leerla (un fixture roto falla fuerte, no en silencio).
import bandejaJson from "@fixtures/mandato-bandeja.json";
import type { ActivoBandeja, Mandato } from "@/shared/types";
import { validarActivo } from "./activo";
import { validarMandato } from "./politica";

export interface Bandeja {
  activos: ActivoBandeja[];
  mandatoPorDefecto: Mandato;
}

/** Valida un JSON con la forma de la bandeja (ids únicos, activos y mandato válidos). Separada de la lectura para poder testearla. */
export function validarBandeja(x: unknown): Bandeja {
  const o = (x ?? {}) as { activos?: unknown; mandatoPorDefecto?: unknown };
  const m = validarMandato(o.mandatoPorDefecto);
  if (!m.ok) throw new Error(`mandato-bandeja.json: el mandato por defecto no es válido: ${m.mensaje}`);
  if (!Array.isArray(o.activos) || o.activos.length === 0) throw new Error("mandato-bandeja.json: faltan los activos.");
  const activos = o.activos.map((a, i) => {
    const r = validarActivo(a);
    if (!r.ok) throw new Error(`mandato-bandeja.json: el activo ${i + 1} no es válido: ${r.mensaje}`);
    return r.activo;
  });
  if (new Set(activos.map((a) => a.id)).size !== activos.length) throw new Error("mandato-bandeja.json: hay ids de activos repetidos.");
  return { activos, mandatoPorDefecto: m.mandato };
}

let memo: Bandeja | undefined;

/** La bandeja validada (se valida una sola vez por proceso). Devuelve una copia: quien la reciba puede modificarla. */
export function leerBandeja(): Bandeja {
  memo ??= validarBandeja(bandejaJson);
  return structuredClone(memo);
}
