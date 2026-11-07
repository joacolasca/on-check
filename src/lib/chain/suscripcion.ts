// Regla del lote de negociación (Facu, 7-11-2026): se suscribe a mínimo 1.000 cuotapartes enteras y de a 1.
// Sin red: la usan la capa chain y el mock.
import { parseUnits } from "viem";
import { errorMinimoCuotapartes, MIN_CUOTAPARTES } from "./errores";

/** Lo que se quiere suscribir: cuotapartes enteras (entero positivo) o un monto en pesos (se convierte a cuotapartes enteras, hacia abajo). */
export type PedidoSuscripcion = { cuotapartes: string } | { monto: string };

/**
 * Cuotapartes enteras a suscribir. `valorCuotapartesWei` es el valor de una cuotaparte en wei (pesos × 10^18).
 * Con `monto`: floor(monto / valorCuotaparte). Aplica el mínimo (1.000) antes de tocar la red.
 */
export function resolverSuscripcion(pedido: PedidoSuscripcion, valorCuotapartesWei: bigint): bigint {
  const cuotapartes = "cuotapartes" in pedido ? BigInt(pedido.cuotapartes) : parseUnits(pedido.monto, 18) / valorCuotapartesWei;
  if (cuotapartes < MIN_CUOTAPARTES) throw errorMinimoCuotapartes(valorCuotapartesWei);
  return cuotapartes;
}
