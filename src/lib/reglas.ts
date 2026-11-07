// Reglas del fondo y cuánto se consume hoy de cada una. Sin React.
import type { PorcionComposicion, ResumenFondo } from "@/shared/types";
import { escalarDecimal, formatDecimal, formatPesos, multiplicarDecimales } from "./format";
import { proporcionBps } from "./panel";

export interface ConsumoRegla {
  id: "emisor" | "industria" | "liquidez";
  nombre: string;
  tipo: "maximo" | "minimo";
  limiteBps: number;
  actualBps: number;
  detalle: string;
  cumple: boolean;
}

export interface ReglaInformativa {
  id: "comision" | "suscripcion" | "rescate" | "objetivo";
  nombre: string;
  valor: string;
  detalle: string;
}

/** La porción más grande por monto (null si no hay). */
export function mayorPorcion(ps: PorcionComposicion[]): PorcionComposicion | null {
  let mayor: PorcionComposicion | null = null;
  for (const p of ps) {
    if (mayor === null || escalarDecimal(p.monto) > escalarDecimal(mayor.monto)) mayor = p;
  }
  return mayor && escalarDecimal(mayor.monto) > 0n ? mayor : null;
}

/** Posición de la barra: escala 0 → max(2 × límite, actual), con la marca del límite. */
export function escalaBarra(actualBps: number, limiteBps: number): { rellenoPct: number; marcaPct: number } {
  const escala = Math.max(limiteBps * 2, actualBps, 1);
  return { rellenoPct: Math.round((actualBps / escala) * 1000) / 10, marcaPct: Math.round((limiteBps / escala) * 1000) / 10 };
}

/** Los tres límites que hace cumplir el contrato, con lo que se usa hoy sobre el patrimonio. */
export function consumosReglas(f: ResumenFondo): ConsumoRegla[] {
  const e = mayorPorcion(f.composicion.porEmisor);
  const i = mayorPorcion(f.composicion.porIndustria);
  const emisorBps = e ? proporcionBps(e.monto, f.totalAssets) : f.concentracionMaxBps;
  const industriaBps = i ? proporcionBps(i.monto, f.totalAssets) : 0;
  const liquidezBps = f.liquidezBps;
  return [
    {
      id: "emisor",
      nombre: "Máximo por emisor",
      tipo: "maximo",
      limiteBps: f.politica.maxEmisorBps,
      actualBps: emisorBps,
      detalle: e ? `Mayor emisor hoy: ${e.etiqueta} (${formatPesos(e.monto)})` : "Todavía no hay cartera",
      cumple: emisorBps <= f.politica.maxEmisorBps,
    },
    {
      id: "industria",
      nombre: "Máximo por industria",
      tipo: "maximo",
      limiteBps: f.politica.maxIndustriaBps,
      actualBps: industriaBps,
      detalle: i ? `Mayor industria hoy: ${i.etiqueta} (${formatPesos(i.monto)})` : "Todavía no hay cartera",
      cumple: industriaBps <= f.politica.maxIndustriaBps,
    },
    {
      id: "liquidez",
      nombre: "Liquidez mínima",
      tipo: "minimo",
      limiteBps: f.politica.liquidezMinBps,
      actualBps: liquidezBps,
      detalle: `${formatPesos(f.liquidez)} disponibles en ARGt (cuenta remunerada simulada)`,
      cumple: liquidezBps >= f.politica.liquidezMinBps,
    },
  ];
}

/** Reglas que no se "consumen": comisión, plazo de rescate y objetivo. */
export function reglasInformativas(f: ResumenFondo, fmtBps: (b: number) => string): ReglaInformativa[] {
  const p = f.politica;
  return [
    { id: "comision", nombre: "Comisión", valor: `${fmtBps(p.comisionAnualBps)} anual`, detalle: `Sobre el patrimonio, devengada día a día. Devengado hasta hoy: ${formatPesos(f.comision.devengadaPesos)}.` },
    { id: "suscripcion", nombre: "Suscripción mínima", valor: `${formatDecimal(p.minCuotapartes)} cuotapartes, de a 1`, detalle: `≈ ${formatPesos(multiplicarDecimales(p.minCuotapartes, f.valorCuotaparte))} al valor de hoy. Sin fracciones; los rescates no tienen mínimo.` },
    { id: "rescate", nombre: "Rescate", valor: `${p.rescateHorasHabiles} horas hábiles`, detalle: `Si lo pedís hasta las ${p.rescateCorteHora} hs (Buenos Aires). Después de esa hora, cuenta desde el siguiente día hábil.` },
    { id: "objetivo", nombre: "Objetivo", valor: `${fmtBps(p.objetivoTnaBps)} TNA`, detalle: "Es un objetivo, no garantizado. El valor de la cuotaparte puede subir o bajar." },
  ];
}
