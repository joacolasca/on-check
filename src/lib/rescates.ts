// Lógica de presentación de los rescates (plazo, fechas, validación). Sin React.
import type { EstadoRescate, RescateVista } from "@/shared/types";
import { compararDecimales, formatDecimal, partesBA } from "./format";

const MS_DIA = 24 * 60 * 60 * 1000;
const OFFSET_BA_MS = 3 * 60 * 60 * 1000; // Buenos Aires = UTC−3

// Los días se manejan como "medianoche de Buenos Aires leída como UTC": así getUTCDay() da el día de la semana local.
const esFinDeSemana = (msLocal: number): boolean => {
  const d = new Date(msLocal).getUTCDay();
  return d === 0 || d === 6;
};

function siguienteHabil(msLocal: number): number {
  let t = msLocal + MS_DIA;
  while (esFinDeSemana(t)) t += MS_DIA;
  return t;
}

/**
 * ESTIMACIÓN de cuándo se puede liquidar un rescate pedido en `ahora`: si es fin de semana o pasaron las 15 hs de
 * Buenos Aires, cuenta desde el siguiente día hábil; el plazo vence a las 00:00 del siguiente día hábil.
 * No considera feriados (TODO(confirmar)). La fecha exacta la fija el contrato al registrar el pedido.
 */
export function liquidableDesdeEstimado(ahora: Date, corteHora = 15): Date {
  const p = partesBA(ahora);
  let base = Date.UTC(p.anio, p.mes - 1, p.dia);
  if (p.diaSemana === 0 || p.diaSemana === 6 || p.hora >= corteHora) base = siguienteHabil(base);
  return new Date(siguienteHabil(base) + OFFSET_BA_MS);
}

export const ETIQUETA_RESCATE: Record<EstadoRescate, string> = {
  Pendiente: "Pendiente",
  Liquidado: "Liquidado",
  Cancelado: "Cancelado",
};

/** ¿Un rescate pendiente ya pasó su fecha de liquidación? */
export const rescateVencido = (r: Pick<RescateVista, "estado" | "liquidableDesde">, ahora: Date): boolean =>
  r.estado === "Pendiente" && new Date(r.liquidableDesde).getTime() <= ahora.getTime();

/**
 * Cuotapartes a rescatar tal como se escriben en es-AR: punto de miles, coma decimal ("70.000", "1,5").
 * Hasta 6 decimales. Devuelve un string decimal con punto.
 */
export function validarCuotapartes(entrada: string, disponibles: string): { cuotapartes: string } | { error: string } {
  const limpio = entrada.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!limpio) return { error: "Ingresá cuántas cuotapartes querés rescatar." };
  if (!/^\d+(\.\d{1,6})?$/.test(limpio)) return { error: "Usá solo números; para decimales, coma y hasta 6 dígitos." };
  const normal = limpio.replace(/^0+(?=\d)/, "");
  if (compararDecimales(normal, "0") === 0) return { error: "Ingresá una cantidad mayor que cero." };
  if (compararDecimales(normal, disponibles) > 0) return { error: `Tenés ${formatDecimal(disponibles, 6)} cuotapartes: no podés rescatar más.` };
  return { cuotapartes: normal };
}
