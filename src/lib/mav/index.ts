// MAV SIMULADO. No hay integración con el Mercado Argentino de Valores: la demo lee datos de demostración de
// shared/fixtures/mav-simulado.json y los rotula siempre "MAV (simulado)". Nunca se presentan como reales.
import datos from "@fixtures/mav-simulado.json";
import type { MavConsulta } from "@/shared/types";

interface EmisorSimulado {
  nombre: string;
  operaciones: number;
  tasaPromedioTnaBps: number;
  plazoPromedioDias: number;
  ultimaOperacion: string;
}

const EMISORES = datos.emisores as Record<string, EmisorSimulado>;

export const NOTA_MAV_SIMULADO =
  "Dato de demostración simulado: no proviene del MAV real. No lo uses para decidir con dinero real.";

/** Historial simulado del emisor. Un CUIT que no está en el fixture devuelve cero operaciones (no se inventa nada). */
export function consultarMavSimulado(cuit: string): MavConsulta {
  const e = EMISORES[cuit.replace(/\D/g, "")];
  if (!e) {
    return {
      fuente: "MAV (simulado)",
      operaciones: 0,
      tasaPromedioTnaBps: null,
      plazoPromedioDias: null,
      ultimaOperacion: null,
      nota: `Sin operaciones registradas para este CUIT en el MAV simulado. ${NOTA_MAV_SIMULADO}`,
    };
  }
  return {
    fuente: "MAV (simulado)",
    operaciones: e.operaciones,
    tasaPromedioTnaBps: e.tasaPromedioTnaBps,
    plazoPromedioDias: e.plazoPromedioDias,
    ultimaOperacion: e.ultimaOperacion,
    nota: NOTA_MAV_SIMULADO,
  };
}
