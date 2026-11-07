// Clientes de viem. Base Sepolia para leer y escribir; Base mainnet solo para leer el ARGt real.
import { createPublicClient, createWalletClient, fallback, http, type Address, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import type { RolCuentaDemo } from "@/shared/types";
import type { ConfigChain } from "./config";
import { ErrorApi } from "./errores";

// Un RPC caído no puede colgar la API: timeout corto y un solo reintento.
export const TIMEOUT_RPC_MS = 8_000;
// Mainnet (ARGt real) tiene un presupuesto más chico: 2 intentos × 4,5 s ≈ 9 s en el peor caso.
export const TIMEOUT_RPC_MAINNET_MS = 4_500;
export const REINTENTOS_RPC = 1;
const transporte = (url: string, timeout = TIMEOUT_RPC_MS) => http(url, { timeout, retryCount: REINTENTOS_RPC });
// Si el RPC principal responde 429 o falla, las lecturas pasan solas a un RPC público que acepta ventanas grandes de getLogs.
export const RPC_RESPALDO_SEPOLIA = "https://base-sepolia-rpc.publicnode.com";
const transporteLectura = (principal: string) => {
  const respaldo = process.env.BASE_SEPOLIA_RPC_FALLBACK_URL || RPC_RESPALDO_SEPOLIA;
  return respaldo === principal ? transporte(principal) : fallback([transporte(principal), transporte(respaldo)]);
};
const memo = new Map<string, PublicClient>();

export function clienteSepolia(cfg: Pick<ConfigChain, "rpcSepolia">): PublicClient {
  const clave = `s:${cfg.rpcSepolia}`;
  let c = memo.get(clave);
  if (!c) {
    c = createPublicClient({ chain: baseSepolia, transport: transporteLectura(cfg.rpcSepolia) }) as PublicClient;
    memo.set(clave, c);
  }
  return c;
}

export function clienteMainnet(rpc: string): PublicClient {
  const clave = `m:${rpc}`;
  let c = memo.get(clave);
  if (!c) {
    c = createPublicClient({ chain: base, transport: transporte(rpc, TIMEOUT_RPC_MAINNET_MS) }) as PublicClient;
    memo.set(clave, c);
  }
  return c;
}

/** Cuenta para firmar. Lanza ErrorApi 503 si el rol no tiene clave privada configurada (p. ej. admin en producción). */
export function cuentaDe(cfg: Pick<ConfigChain, "claves">, rol: RolCuentaDemo) {
  const clave = cfg.claves[rol];
  if (!clave) throw new ErrorApi("CONFIGURACION", `El servidor no tiene la clave privada del rol ${rol}: esa operación está deshabilitada.`, 503);
  return privateKeyToAccount(clave);
}

/** Dirección pública del rol (no necesita la clave). */
export const direccionDe = (cfg: Pick<ConfigChain, "direcciones">, rol: RolCuentaDemo): Address => cfg.direcciones[rol];

export function billetera(cfg: Pick<ConfigChain, "claves" | "rpcSepolia">, rol: RolCuentaDemo) {
  const account = cuentaDe(cfg, rol);
  // También las escrituras caen al RPC de respaldo si el principal responde 429 (solo entra si el primero falla).
  return { account, wallet: createWalletClient({ account, chain: baseSepolia, transport: transporteLectura(cfg.rpcSepolia) }) };
}
