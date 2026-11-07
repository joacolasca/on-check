// Piezas comunes de las rutas del Mandato: estado firmado, mandato revocado y errores de configuración.
import { ErrorApi } from "@/lib/chain/errores";
import { verificarEstado } from "@/lib/mandato/estado";
import type { EstadoMandato } from "@/shared/types";
import { error } from "./http";

/** Lee y verifica el estado firmado del cuerpo. Sin firma válida (o vencida, o adulterada): 400 ESTADO_INVALIDO. */
export function leerEstadoFirmado(valor: unknown): { estado: EstadoMandato } | { respuesta: Response } {
  const estado = verificarEstado(valor);
  if (!estado) return { respuesta: error("ESTADO_INVALIDO", "El estado del mandato no tiene una firma válida del servidor. Iniciá el mandato de nuevo.") };
  return { estado };
}

/** 409 MANDATO_REVOCADO si el mandato está revocado; null si sigue vigente. */
export function siEstaRevocado(estado: EstadoMandato): Response | null {
  return estado.revocado ? error("MANDATO_REVOCADO", "El mandato está revocado: el agente no compra ni analiza nada más. Iniciá uno nuevo si querés seguir.", 409) : null;
}

/** Corre `f` y convierte un ErrorApi (por ejemplo, el servidor sin COTIZACION_SECRETO en producción) en su respuesta. */
export async function conErrorApi(f: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof ErrorApi) return error(e.codigo, e.message, e.status);
    throw e;
  }
}
