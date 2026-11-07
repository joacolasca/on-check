// Límites duros del fondo v2, espejo exacto de ChequeFund.fondearCheque (contracts/src/ChequeFund.sol). Función pura con bigint
// (unidades de 18 decimales). En el contrato, en este orden y todo sobre `patrimonio = totalAssets()` (saldo de ARGt + cheques Funded):
//   1. emisor:    exposicion[librador] + precio  >  mulDiv(patrimonio, maxConcentracionBps, 10000)   (redondea para abajo)
//   2. industria: exposicionIndustria[id] + precio > mulDiv(patrimonio, maxIndustriaBps, 10000)       (redondea para abajo; la industria 0 "sin clasificar" también cuenta)
//   3. sin liquidez: saldo de ARGt < precio
//   4. liquidez mínima: saldo - precio < mulDiv(patrimonio, liquidezMinBps, 10000, Ceil)               (redondea para ARRIBA)
// La comisión (`_devengar`) emite cuotapartes nuevas al receptor pero no cambia `totalAssets()`: no mueve ninguno de estos límites.
// Registrar un cheque (Pending) no mueve fondos ni exposición: solo cuenta lo que ya está Funded.
// Con patrimonio 0 el máximo es 0: cualquier activo excede (el contrato revertiría).
export const BPS = 10_000n;

/** mulDiv(patrimonio, bps, 10000) redondeando para abajo (tope por emisor y por industria). */
export function maximoPermitido(patrimonio: bigint, bps: bigint): bigint {
  return (patrimonio * bps) / BPS;
}

/** mulDiv(patrimonio, bps, 10000, Ceil): liquidez mínima que tiene que quedar. */
export function liquidezMinima(patrimonio: bigint, bps: bigint): bigint {
  return (patrimonio * bps + BPS - 1n) / BPS;
}

/** ¿Comprar este activo deja a un emisor o industria por encima de su tope? Misma cuenta que el contrato. */
export function excedeConcentracion(exposicionActual: bigint, precioCompra: bigint, patrimonio: bigint, maxBps: bigint): boolean {
  return exposicionActual + precioCompra > maximoPermitido(patrimonio, maxBps);
}

/** Concentración proyectada en bps, redondeada hacia arriba (no mostrar "10 %" cuando se pasa del tope). null si el fondo está vacío. */
export function proyectadaBps(exposicionActual: bigint, precioCompra: bigint, patrimonio: bigint): number | null {
  if (patrimonio <= 0n) return null;
  const n = (exposicionActual + precioCompra) * BPS;
  return Number((n + patrimonio - 1n) / patrimonio);
}

export interface EntradaLimites {
  patrimonio: bigint;
  /** Saldo de ARGt del fondo (lo disponible para pagar). */
  liquidez: bigint;
  exposicionEmisor: bigint;
  exposicionIndustria: bigint;
  precioCompra: bigint;
  maxEmisorBps: bigint;
  maxIndustriaBps: bigint;
  liquidezMinBps: bigint;
}

export type ViolacionLimite =
  | { tipo: "emisor" | "industria"; proyectada: bigint; maximo: bigint }
  | { tipo: "sin_liquidez"; disponible: bigint; precioCompra: bigint }
  | { tipo: "liquidez_minima"; liquidezPosterior: bigint; minima: bigint };

/** Primer límite que se rompe, en el mismo orden que el contrato; null si se puede comprar. */
export function primeraViolacion(i: EntradaLimites): ViolacionLimite | null {
  const proyectada = i.exposicionEmisor + i.precioCompra;
  const maximo = maximoPermitido(i.patrimonio, i.maxEmisorBps);
  if (proyectada > maximo) return { tipo: "emisor", proyectada, maximo };
  const proyectadaIndustria = i.exposicionIndustria + i.precioCompra;
  const maximoIndustria = maximoPermitido(i.patrimonio, i.maxIndustriaBps);
  if (proyectadaIndustria > maximoIndustria) return { tipo: "industria", proyectada: proyectadaIndustria, maximo: maximoIndustria };
  if (i.liquidez < i.precioCompra) return { tipo: "sin_liquidez", disponible: i.liquidez, precioCompra: i.precioCompra };
  const liquidezPosterior = i.liquidez - i.precioCompra;
  const minima = liquidezMinima(i.patrimonio, i.liquidezMinBps);
  if (liquidezPosterior < minima) return { tipo: "liquidez_minima", liquidezPosterior, minima };
  return null;
}
