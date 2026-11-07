// Lógica pura de las tortas del panel: agrupar, ordenar, repartir porcentajes que sumen 100 % y trazar los arcos. Sin React.
import type { Composicion, PorcionComposicion } from "@/shared/types";
import { escalarDecimal, sumarDecimales } from "./format";

export type Desglose = "emisor" | "industria" | "tipo";

export const DESGLOSES: { id: Desglose; etiqueta: string; titulo: string }[] = [
  { id: "emisor", etiqueta: "Por emisor", titulo: "Cartera por emisor" },
  { id: "industria", etiqueta: "Por industria", titulo: "Cartera por industria" },
  { id: "tipo", etiqueta: "Cheques y pagarés", titulo: "Cartera por tipo de instrumento" },
];

/** Cantidad máxima de porciones visibles (la última puede ser "Otros"). */
export const MAX_PORCIONES = 6;

export interface PorcionTorta {
  clave: string;
  etiqueta: string;
  monto: string;
  permil: number; // 0–1000; el conjunto suma exactamente 1000 si hay montos
  color: string; // variable CSS de src/app/globals.css
  agrupada: boolean; // true en "Otros"
}

const ETIQUETA_TIPO: Record<string, string> = { cheque: "Cheques", pagare: "Pagarés" };

export function porcionesDe(c: Composicion, d: Desglose): PorcionComposicion[] {
  if (d === "emisor") return c.porEmisor;
  if (d === "industria") return c.porIndustria;
  return c.porTipo.map((p) => ({ ...p, etiqueta: ETIQUETA_TIPO[p.clave] ?? p.etiqueta }));
}

/**
 * Reparte 1000 permilles entre los montos con el método del resto mayor: el resultado siempre suma 1000
 * (los redondeos individuales no dejan 99,9 % ni 100,1 %). Todos en cero → todos cero.
 */
export function repartirPermil(montos: bigint[]): number[] {
  const suma = montos.reduce((a, b) => a + b, 0n);
  if (suma <= 0n) return montos.map(() => 0);
  const base = montos.map((m) => (m * 1000n) / suma);
  const restos = montos.map((m, i) => ({ i, r: (m * 1000n) % suma }));
  const faltan = 1000 - Number(base.reduce((a, b) => a + b, 0n));
  restos.sort((x, y) => (x.r === y.r ? x.i - y.i : x.r > y.r ? -1 : 1));
  for (let k = 0; k < faltan; k++) base[restos[k].i] += 1n;
  return base.map(Number);
}

export const colorSerie = (indice: number): string => `var(--serie-${indice + 1})`;
const COLOR_OTROS = "var(--serie-otros)";

/** Ordena de mayor a menor, descarta montos en cero, agrupa la cola en "Otros (n)" y asigna colores. */
export function armarPorciones(porciones: PorcionComposicion[], max = MAX_PORCIONES): PorcionTorta[] {
  const validas = porciones
    .filter((p) => escalarDecimal(p.monto) > 0n)
    .sort((a, b) => {
      const x = escalarDecimal(a.monto);
      const y = escalarDecimal(b.monto);
      return x === y ? a.etiqueta.localeCompare(b.etiqueta, "es-AR") : x > y ? -1 : 1;
    });
  const visibles: { clave: string; etiqueta: string; monto: string; agrupada: boolean }[] = validas
    .slice(0, validas.length > max ? max - 1 : max)
    .map((p) => ({ clave: p.clave, etiqueta: p.etiqueta, monto: p.monto, agrupada: false }));
  if (validas.length > max) {
    const cola = validas.slice(max - 1);
    visibles.push({ clave: "otros", etiqueta: `Otros (${cola.length})`, monto: cola.reduce((a, p) => sumarDecimales(a, p.monto), "0"), agrupada: true });
  }
  const permiles = repartirPermil(visibles.map((v) => escalarDecimal(v.monto)));
  return visibles.map((v, i) => ({ ...v, permil: permiles[i], color: v.agrupada ? COLOR_OTROS : colorSerie(i) }));
}

export const totalPorciones = (ps: { monto: string }[]): string => ps.reduce((a, p) => sumarDecimales(a, p.monto), "0");

/** Texto para lectores de pantalla: "Cartera por emisor: Coto 30 %, …". */
export function descripcionTorta(titulo: string, ps: PorcionTorta[], formatoPermil: (p: number) => string): string {
  if (ps.length === 0) return `${titulo}: sin datos todavía.`;
  return `${titulo}: ${ps.map((p) => `${p.etiqueta} ${formatoPermil(p.permil)}`).join(", ")}.`;
}

// ---------- Geometría ----------

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const DOS_PI = Math.PI * 2;

/** Ángulos (radianes, desde las 12 en sentido horario) de cada porción según sus permilles. */
export function angulosPorciones(permiles: number[]): { inicio: number; fin: number }[] {
  const total = permiles.reduce((a, b) => a + b, 0);
  let acc = 0;
  return permiles.map((p) => {
    const inicio = total === 0 ? 0 : (acc / total) * DOS_PI - Math.PI / 2;
    acc += p;
    const fin = total === 0 ? 0 : (acc / total) * DOS_PI - Math.PI / 2;
    return { inicio, fin };
  });
}

/** Trazo SVG de un sector de anillo. Una porción del 100 % es un anillo completo (usar fill-rule evenodd). */
export function trazoAnillo(cx: number, cy: number, rExt: number, rInt: number, inicio: number, fin: number): string {
  const p = (r: number, a: number) => `${r3(cx + r * Math.cos(a))} ${r3(cy + r * Math.sin(a))}`;
  if (fin - inicio >= DOS_PI - 1e-9) {
    const circulo = (r: number, barrido: 0 | 1) =>
      `M ${r3(cx + r)} ${r3(cy)} A ${r} ${r} 0 1 ${barrido} ${r3(cx - r)} ${r3(cy)} A ${r} ${r} 0 1 ${barrido} ${r3(cx + r)} ${r3(cy)} Z`;
    return `${circulo(rExt, 1)} ${circulo(rInt, 0)}`;
  }
  const grande = fin - inicio > Math.PI ? 1 : 0;
  return `M ${p(rExt, inicio)} A ${rExt} ${rExt} 0 ${grande} 1 ${p(rExt, fin)} L ${p(rInt, fin)} A ${rInt} ${rInt} 0 ${grande} 0 ${p(rInt, inicio)} Z`;
}
