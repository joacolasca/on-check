// Composición de la cartera (cheques y pagarés Funded, a su costo) por emisor, industria y tipo. Funciones puras.
import cuitsDemo from "@fixtures/cheques-demo.json";
import { hashCorto, unidadesADecimal } from "@/lib/format";
import { hashLibrador } from "@/lib/scoring";
import type { Composicion, PorcionComposicion, TipoActivo } from "@/shared/types";
import { nombreIndustria } from "./industrias";

// Misma sal de desarrollo que src/lib/scoring/cotizar.ts (no se exporta de ahí): si cambia allá, hay que cambiarla acá.
const SAL_DE_DESARROLLO = "salt-de-desarrollo-no-usar-en-produccion";

/** hash del librador (en minúscula) → nombre, para los emisores con CUIT verificado de shared/fixtures/cheques-demo.json. */
export function emisoresConocidos(salt: string = process.env.CUIT_SALT || SAL_DE_DESARROLLO): Map<string, string> {
  const m = new Map<string, string>();
  const fuentes = [...cuitsDemo.cheques, cuitsDemo.suplente];
  for (const f of fuentes) m.set(hashLibrador(f.librador_cuit, salt).toLowerCase(), f.librador_nombre);
  return m;
}

/** Nombre del emisor si el hash coincide con uno conocido; si no, null. */
export const nombreEmisor = (libradorHash: string, conocidos: Map<string, string> = emisoresConocidos()): string | null => conocidos.get(libradorHash.toLowerCase()) ?? null;

export interface ItemComposicion {
  emisor: string; // clave: libradorHash
  emisorEtiqueta: string;
  industria: number;
  tipo: TipoActivo;
  monto: bigint; // 18 decimales
}

type Acumulado = Map<string, { etiqueta: string; monto: bigint }>;

/** Reparte 10000 bps entre las porciones por mayor resto: la suma da exactamente 10000 (o 0 si no hay nada). */
function porciones(mapa: Acumulado): PorcionComposicion[] {
  const filas = [...mapa].map(([clave, v]) => ({ clave, ...v })).sort((a, b) => (a.monto === b.monto ? (a.clave < b.clave ? -1 : 1) : a.monto > b.monto ? -1 : 1));
  const total = filas.reduce((s, f) => s + f.monto, 0n);
  const salida = (bps: (i: number) => number) =>
    filas.map((f, i): PorcionComposicion => ({ clave: f.clave, etiqueta: f.etiqueta, monto: unidadesADecimal(f.monto.toString()), bps: bps(i) }));
  if (total === 0n) return salida(() => 0);
  const base = filas.map((f) => (f.monto * 10_000n) / total);
  let faltan = 10_000n - base.reduce((s, b) => s + b, 0n);
  const orden = filas.map((f, i) => ({ i, resto: (f.monto * 10_000n) % total })).sort((a, b) => (a.resto === b.resto ? a.i - b.i : a.resto > b.resto ? -1 : 1));
  for (const { i } of orden) {
    if (faltan <= 0n) break;
    base[i] += 1n;
    faltan -= 1n;
  }
  return salida((i) => Number(base[i]));
}

const ETIQUETA_TIPO: Record<TipoActivo, string> = { cheque: "Cheques", pagare: "Pagarés" };

export function componer(items: ItemComposicion[]): Composicion {
  const emisor: Acumulado = new Map();
  const industria: Acumulado = new Map();
  const tipo: Acumulado = new Map();
  const sumar = (m: Acumulado, clave: string, etiqueta: string, monto: bigint) => m.set(clave, { etiqueta, monto: (m.get(clave)?.monto ?? 0n) + monto });
  for (const it of items) {
    sumar(emisor, it.emisor, it.emisorEtiqueta, it.monto);
    sumar(industria, String(it.industria), nombreIndustria(it.industria), it.monto);
    sumar(tipo, it.tipo, ETIQUETA_TIPO[it.tipo], it.monto);
  }
  return { porEmisor: porciones(emisor), porIndustria: porciones(industria), porTipo: porciones(tipo) };
}

/** Etiqueta de un emisor: su nombre si es conocido, y si no el hash corto. */
export const etiquetaEmisor = (libradorHash: string, conocidos?: Map<string, string>): string => nombreEmisor(libradorHash, conocidos) ?? hashCorto(libradorHash);
