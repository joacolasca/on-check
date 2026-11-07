// Despliegue del fondo en Avalanche Fuji (track Blockchain). Mismos contratos que en Base Sepolia.
import { encodePacked, keccak256, stringToHex, type Hex } from "viem";

export const FUJI_CHAIN_ID_HEX = "0xa869"; // 43113
export const FUJI_PARAMS = {
  chainId: FUJI_CHAIN_ID_HEX,
  chainName: "Avalanche Fuji C-Chain",
  nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
  rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
  blockExplorerUrls: ["https://testnet.snowtrace.io"],
};
export const SNOWTRACE_FUJI = "https://testnet.snowtrace.io";

// Despliegue en Fuji del 7-11-2026, verificado en Snowtrace (docs/evidencia-onchain/avalanche/README.md).
export const FUJI = {
  mockARGt: "0x026f24BF9Ea99302E1CBadFC8D384EF405Beaf58" as `0x${string}`,
  chequeFund: "0xaCB72e4B9d31DA54BD1830Df3022BA41F42afc56" as `0x${string}`,
};

// ARGt real de Twin en Avalanche C-Chain (solo lectura; verificado en Snowtrace el 7-11-2026).
export const ARGT_AVALANCHE_MAINNET = "0x2E4e93eCA2E16E4989b894e188B7F7fC0175703B" as const;
export const AVALANCHE_RPC = "https://api.avax.network/ext/bc/C/rpc";

export const ORIGINADOR_ROLE = keccak256(stringToHex("ORIGINADOR_ROLE"));

export interface ChequeDemo {
  id: Hex;
  libradorHash: Hex;
  pyme: `0x${string}`;
  nominal: bigint;
  precioCompra: bigint;
  vencimiento: bigint;
  puntaje: number;
  tasaBps: number;
  cotizacionHash: Hex;
}

/**
 * Cheque de demostración. El librador va hasheado con una sal (D9: el CUIT nunca va en claro);
 * acá no se usa ningún CUIT real: es una etiqueta de demo.
 */
export function chequeDemo(pyme: `0x${string}`, ahoraSeg: bigint, etiqueta: string): ChequeDemo {
  const nominal = 100_000n * 10n ** 18n;
  return {
    id: keccak256(stringToHex(`fuji:cheque:${etiqueta}`)),
    libradorHash: keccak256(encodePacked(["string", "string"], ["librador-demo", etiqueta])),
    pyme,
    nominal,
    precioCompra: 95_000n * 10n ** 18n,
    vencimiento: ahoraSeg + 60n * 86_400n,
    puntaje: 85,
    tasaBps: 3000,
    cotizacionHash: keccak256(stringToHex(`cotizacion-demo:${etiqueta}`)),
  };
}
