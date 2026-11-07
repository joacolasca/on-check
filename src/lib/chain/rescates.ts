// Rescates: plazo de liquidación (espejo del contrato, solo para el mock y para mostrar), resultado de la liquidación y la
// explicación del gestor sobre liquidez y la reserva. Montos en bigint (18 decimales) o string decimal, nunca number.
import { formatPesos, unidadesADecimal } from "@/lib/format";

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
const BA_OFFSET_MS = 3 * HORA_MS; // Buenos Aires = UTC−3, sin horario de verano
const CORTE_HORA = 15;

const esFinDeSemana = (diaFalsoUtc: number) => [0, 6].includes(new Date(diaFalsoUtc).getUTCDay());
const siguienteHabil = (diaFalsoUtc: number) => {
  let d = diaFalsoUtc;
  do d += DIA_MS;
  while (esFinDeSemana(d));
  return d;
};

/**
 * Cuándo se puede liquidar un rescate pedido en `tsMs` (ms Unix). Mismo criterio que `liquidableDesde` del contrato (V2-SPEC):
 * hora de Buenos Aires; si es sábado, domingo o ≥ 15:00 el plazo cuenta desde el siguiente día hábil, y vence a las 00:00 (BA)
 * del siguiente día hábil. Feriados: no se consideran (TODO(confirmar)). La fuente de verdad es el contrato; esto es para el mock.
 */
export function liquidableDesde(tsMs: number): number {
  const ba = new Date(tsMs - BA_OFFSET_MS); // los campos UTC de `ba` son la hora de reloj de Buenos Aires
  let dia = Date.UTC(ba.getUTCFullYear(), ba.getUTCMonth(), ba.getUTCDate());
  const cuentaHoy = !esFinDeSemana(dia) && ba.getUTCHours() < CORTE_HORA;
  if (!cuentaHoy) dia = siguienteHabil(dia);
  return siguienteHabil(dia) + BA_OFFSET_MS;
}

export interface RescateLiquidado {
  id: string;
  duenio: string;
  cuotapartes: string;
  monto: string; // pesos pagados
  tx: string;
}
export interface RescateOmitido {
  id: string;
  motivo: string;
}
export interface ResultadoLiquidacion {
  liquidados: RescateLiquidado[];
  omitidos: RescateOmitido[];
  pendientesNoVencidos: number; // siguen Pendientes porque todavía no cumplieron el plazo
  liquidezAntes: string;
  liquidezDespues: string;
  liquidezDespuesBps: number;
  reservaMinimaBps: number;
  modoDemo: boolean;
  explicacionGestor: string; // castellano: liquidez disponible vs. rescates e impacto en la reserva
}

const bpsDe = (parte: bigint, total: bigint): number => (total > 0n ? Number((parte * 10_000n) / total) : 0);
const pct = (bps: number): string => `${(bps / 100).toString().replace(".", ",")} %`;
const pesos = (wei: bigint) => formatPesos(unidadesADecimal(wei.toString()));

export interface EntradaExplicacion {
  liquidezAntes: bigint;
  liquidezDespues: bigint;
  totalAssetsDespues: bigint;
  pagado: bigint;
  cantidadLiquidados: number;
  omitidos: number;
  pendientesNoVencidos: number;
  reservaMinimaBps: number;
  modoDemo: boolean;
}

/** Explicación del gestor: qué pasó con la liquidez y con la reserva mínima. Solo describe; las reglas las hace cumplir el contrato. */
export function explicarLiquidacion(e: EntradaExplicacion): { texto: string; liquidezDespuesBps: number } {
  const bps = bpsDe(e.liquidezDespues, e.totalAssetsDespues);
  const partes: string[] = [];
  if (e.cantidadLiquidados === 0) {
    partes.push(
      e.omitidos + e.pendientesNoVencidos === 0
        ? "No había rescates pendientes para liquidar."
        : `No liquidé ningún rescate. La liquidez disponible es ${pesos(e.liquidezAntes)}.`,
    );
  } else {
    partes.push(
      `Liquidé ${e.cantidadLiquidados} rescate${e.cantidadLiquidados === 1 ? "" : "s"} por ${pesos(e.pagado)}${e.modoDemo ? " (modo demo: sin esperar el plazo)" : ""}. La liquidez pasó de ${pesos(e.liquidezAntes)} a ${pesos(e.liquidezDespues)}, que es ${pct(bps)} del patrimonio.`,
    );
    partes.push(
      bps >= e.reservaMinimaBps
        ? `Sigue por encima de la reserva mínima del ${pct(e.reservaMinimaBps)}, así que el fondo puede seguir comprando cheques.`
        : `Quedó por debajo de la reserva mínima del ${pct(e.reservaMinimaBps)}: hasta recomponerla (por ejemplo, cuando se cobren cheques) el contrato no deja fondear nuevos cheques.`,
    );
  }
  if (e.omitidos > 0) {
    partes.push(`${e.omitidos} rescate${e.omitidos === 1 ? "" : "s"} quedó pendiente por falta de liquidez: se paga con ARGt disponible, el gestor no vende cheques para cubrirlo.`);
  }
  if (e.pendientesNoVencidos > 0) {
    partes.push(`${e.pendientesNoVencidos} rescate${e.pendientesNoVencidos === 1 ? "" : "s"} sigue pendiente porque todavía no cumplió las 24 horas hábiles.`);
  }
  return { texto: partes.join(" "), liquidezDespuesBps: bps };
}
