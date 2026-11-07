// Respuesta de GET /api/cheques/[id]. Solo tipos: la UI los importa sin traer código de servidor.
import type { InformeActivo } from "@/lib/agent/informe";
import type { ChequeVista } from "@/shared/types";

export interface ChequeDetalle {
  /** El activo (cheque o pagaré) tal como lo muestra la lista. */
  cheque: ChequeVista;
  /** Hash de la cotización registrado on-chain; null en modo mock si el dato de ejemplo no lo trae. */
  cotizacionHash: string | null;
  libradorHash: string | null;
  historial: { tipo: string; hash: string; url: string }[];
  /** Informe completo del agente, si este servidor todavía lo tiene en memoria (y coincide con el hash on-chain); si no, null. */
  informe: InformeActivo | null;
}
