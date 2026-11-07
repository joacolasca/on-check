// Indicadores ponderados de la cartera activa (cheques/pagarés Funded). Se calculan con lo que ya trae /api/cheques.
// Pesos en centavos (bigint), nunca `number` para plata. Objetivo y comisión salen de la política del fondo, sin números a mano.
import type { ChequeVista } from "@/shared/types";
import { tasaPorPuntaje } from "./scoring/config";
import { aCentavos, deCentavos } from "./scoring/dinero";

/** Lo que se necesita de la política (alcanza con `ResumenFondo.politica`). */
export interface PoliticaRentabilidad {
  objetivoTnaBps: number;
  comisionAnualBps: number;
}

export interface MetricasCartera {
  puntajePromedioCentesimas: number; // 87,35 → 8735
  tasaBrutaBps: number;
  /** Bruta − comisión anual de la política. */
  tasaNetaEstimadaBps: number;
  capital: string; // pesos, 2 decimales
  cantidad: number;
  /** Neta estimada − objetivo neto (negativa = por debajo del objetivo). */
  brechaNetaBps: number;
}

/** Tasa bruta que necesita la cartera para llegar al objetivo neto: objetivo + comisión. */
export function objetivoBrutoBps(p: PoliticaRentabilidad): number {
  return p.objetivoTnaBps + p.comisionAnualBps;
}

/**
 * Puntaje de equilibrio: el mayor puntaje entero (0–100) cuya tasa, según la regla real (TAMAR + spread con piso y tope),
 * alcanza la tasa bruta pedida. Una cartera con puntaje promedio igual o menor a este llega al bruto objetivo.
 * null si ni siquiera el puntaje 0 llega (el tope está por debajo).
 */
export function puntajeDeEquilibrio(brutoBps: number): number | null {
  for (let p = 100; p >= 0; p--) if (tasaPorPuntaje(p).tasaBps >= brutoBps) return p;
  return null;
}

/** Textos de la UI, para poder testear que no prometen nada. */
export function textosRentabilidad(p: PoliticaRentabilidad, fmtBps: (bps: number) => string) {
  const eq = puntajeDeEquilibrio(objetivoBrutoBps(p));
  return {
    puntajeEtiqueta: "Puntaje promedio ponderado",
    puntajeNota: `Ponderado por lo adelantado en cada activo vigente${eq === null ? "" : ` · de referencia: ${eq} o menos llega al objetivo`}`,
    brutaEtiqueta: "Tasa bruta promedio",
    brutaNota: "Promedio ponderado de los activos vigentes, antes de la comisión",
    netaEtiqueta: "Tasa neta estimada",
    netaNota: `Bruta menos ${fmtBps(p.comisionAnualBps)} de comisión · objetivo ${fmtBps(p.objetivoTnaBps)} neto`,
    netaAviso: "Objetivo, no garantizado: puede no cumplirse",
    sinActivos: "Sin activos vigentes",
  } as const;
}

function divRedondeado(num: bigint, den: bigint): bigint {
  return (num * 2n + den) / (den * 2n); // half-up (valores no negativos)
}

/** Centavos → pesos con siempre 2 decimales (deCentavos recorta ceros). */
function pesos2(c: bigint): string {
  const [e, f = ""] = deCentavos(c).split(".");
  return `${e}.${f.padEnd(2, "0")}`;
}

/** Null si no hay activos vigentes (Funded) o el capital es cero. */
export function metricasCartera(cheques: ChequeVista[], politica: PoliticaRentabilidad): MetricasCartera | null {
  const vigentes = cheques.filter((c) => c.estado === "Funded");
  let capital = 0n;
  let sumPuntaje = 0n;
  let sumTasa = 0n;
  for (const c of vigentes) {
    const w = aCentavos(c.precioCompra);
    capital += w;
    sumPuntaje += w * BigInt(c.puntaje) * 100n;
    sumTasa += w * BigInt(c.tasaTnaBps);
  }
  if (vigentes.length === 0 || capital === 0n) return null;
  const tasaBrutaBps = Number(divRedondeado(sumTasa, capital));
  const tasaNetaEstimadaBps = tasaBrutaBps - politica.comisionAnualBps;
  return {
    puntajePromedioCentesimas: Number(divRedondeado(sumPuntaje, capital)),
    tasaBrutaBps,
    tasaNetaEstimadaBps,
    capital: pesos2(capital),
    cantidad: vigentes.length,
    brechaNetaBps: tasaNetaEstimadaBps - politica.objetivoTnaBps,
  };
}

/** 8735 → "87,35"; 8700 → "87,00". */
export function formatPuntajeCentesimas(centesimas: number): string {
  const ent = Math.trunc(centesimas / 100);
  const dec = String(centesimas % 100).padStart(2, "0");
  return `${ent},${dec}`;
}
