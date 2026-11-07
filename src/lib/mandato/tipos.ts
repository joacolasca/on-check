// Tipos de las rutas nuevas del Mandato (corrida en paralelo). Viven acá y no en src/shared/types.ts (compartido: no se toca sin confirmar).
// Anotado para el equipo: si algún día los necesita otro módulo, pasan a src/shared/types.ts con el OK del usuario.
import type { Cotizacion, EvaluacionMandato } from "@/shared/types";

/** Lo mínimo del activo que necesita `POST /api/mandato/evaluar` (el resto sale de la cotización firmada). */
export interface ActivoRef {
  id: string;
  nombre: string;
}

/** Cuerpo de `POST /api/mandato/evaluar`. `estado` es el EstadoMandato firmado (se verifica en el servidor). */
export interface PedidoEvaluar {
  estado: unknown;
  cotizacion: Cotizacion;
  activo: ActivoRef;
}

/** Respuesta de `POST /api/mandato/evaluar`. */
export interface RespuestaEvaluar {
  evaluacion: EvaluacionMandato;
}

/** Respuesta JSON (sin NDJSON) de `POST /api/agente/mandato` con `soloAnalisis: true`. */
export interface RespuestaSoloAnalisis {
  cotizacion: Cotizacion;
  pasos: unknown[];
}
