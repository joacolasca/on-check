// Pago con ARGt real en Arbitrum One (track Twin: "al menos una transacción onchain ejecutada por tu producto").
// Funciones puras: arman la transacción; la firma la hace el usuario en su wallet.
import { encodeFunctionData, erc20Abi, getAddress, isAddress, keccak256, parseUnits, stringToHex, type Hex } from "viem";

// Fuente: PDF oficial del track Twin (tabla "Contratos de los tokens", columna Arbitrum).
export const ARGT_ARBITRUM = getAddress("0x59863989d080B22476DB95656d0C3CC18be92214");
export const ARBITRUM_CHAIN_ID = 42161;
export const ARBITRUM_CHAIN_ID_HEX = "0xa4b1";
export const ARBISCAN = "https://arbiscan.io";
export const DECIMALES_ARGT = 18;
// Tope de seguridad de la demo: es plata real, se mueve poco.
export const MAX_ARGT_DEMO = 200n;

export type ErrorPago = "DESTINO_INVALIDO" | "MONTO_INVALIDO" | "MONTO_EXCEDE_TOPE" | "REFERENCIA_VACIA";

export interface PagoArgt {
  to: `0x${string}`;
  data: Hex;
  memo: Hex;
  monto: bigint;
}

/** Referencia del cheque que viaja pegada al calldata (32 bytes). No lleva datos personales: el CUIT no va acá. */
export function memoDeReferencia(referencia: string): Hex {
  return keccak256(stringToHex(`hackatwin:cheque:${referencia.trim()}`));
}

/**
 * Arma un `transfer(destino, monto)` de ARGt con la referencia del cheque agregada al final del calldata.
 * El token ignora los bytes extra (decodificación ABI), así que la transferencia es estándar y la referencia
 * queda visible en el explorer ("Input Data").
 */
export function armarPagoArgt(destino: string, montoArgt: string, referencia: string): PagoArgt | { error: ErrorPago } {
  if (!isAddress(destino)) return { error: "DESTINO_INVALIDO" };
  if (!referencia.trim()) return { error: "REFERENCIA_VACIA" };
  if (!/^\d+(\.\d{1,18})?$/.test(montoArgt.trim())) return { error: "MONTO_INVALIDO" };
  const monto = parseUnits(montoArgt.trim(), DECIMALES_ARGT);
  if (monto <= 0n) return { error: "MONTO_INVALIDO" };
  if (monto > MAX_ARGT_DEMO * 10n ** BigInt(DECIMALES_ARGT)) return { error: "MONTO_EXCEDE_TOPE" };
  const memo = memoDeReferencia(referencia);
  const base = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [getAddress(destino), monto] });
  return { to: ARGT_ARBITRUM, data: `${base}${memo.slice(2)}` as Hex, memo, monto };
}
