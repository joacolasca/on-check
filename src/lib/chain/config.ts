// Configuración de la capa chain: RPCs, direcciones del contrato desplegado y wallets de demo (D7, solo del lado del servidor).
// Las claves se leen del entorno y nunca se imprimen ni se devuelven.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isAddress, type Address, type Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import type { RolCuentaDemo } from "@/shared/types";

export const RPC_SEPOLIA_POR_DEFECTO = "https://sepolia.base.org";
export const RPC_MAINNET_POR_DEFECTO = "https://mainnet.base.org";
/** ARGt real en Base mainnet (solo lectura). Fuente: docs.twin.finance/stablecoins/contracts, verificada el 2-11-2026. */
export const ARGT_MAINNET_POR_DEFECTO = "0xf016413834E6D1A14F3D628B11D6Ef725a6bdbDD";

const VARIABLE_DE_CLAVE: Record<RolCuentaDemo, string> = {
  admin: "DEPLOYER_PRIVATE_KEY",
  originador: "ORIGINADOR_PRIVATE_KEY",
  oraculo: "ORACULO_PRIVATE_KEY",
  inversor1: "INVERSOR1_PRIVATE_KEY",
  inversor2: "INVERSOR2_PRIVATE_KEY",
  pyme: "PYME_PRIVATE_KEY",
};

/** Roles que pueden configurarse solo con la dirección pública (el servidor no firma como ellos en producción). */
const VARIABLE_DE_DIRECCION: Partial<Record<RolCuentaDemo, string>> = { admin: "ADMIN_ADDRESS", pyme: "PYME_ADDRESS" };

export interface ConfigChain {
  rpcSepolia: string;
  rpcMainnet: string;
  chequeFund: Address;
  mockArgt: Address;
  desdeBloque: bigint; // bloque de despliegue del contrato: desde ahí se leen los eventos
  /** Dirección pública de cada rol (sale de la clave, o de ADMIN_ADDRESS / PYME_ADDRESS). */
  direcciones: Record<RolCuentaDemo, Address>;
  /** Claves privadas disponibles. admin y pyme pueden no tenerla (producción solo con 4 claves). */
  claves: Partial<Record<RolCuentaDemo, Hex>>;
  argtMainnet: Address;
}

/** Falta algo de la configuración (el mensaje dice qué variable, nunca su valor). */
export class ConfigChainError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ConfigChainError";
  }
}

type Env = Record<string, string | undefined>;

/**
 * Respaldo de las variables: el JSON que escribe el deploy. CHAIN_DEPLOYMENT_FILE cambia la ruta;
 * vacío lo desactiva (los tests lo dejan vacío para no depender del deploy commiteado en el repo).
 */
function leerDespliegue(): { chequeFund?: string; mockARGt?: string; bloqueDespliegue?: number } {
  const ruta = process.env.CHAIN_DEPLOYMENT_FILE ?? join(process.cwd(), "shared", "deployments", "base-sepolia.json");
  if (!ruta) return {};
  try {
    return JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    return {};
  }
}

const aHex = (v: string): Hex => (v.startsWith("0x") ? v : `0x${v}`) as Hex;

/** ¿Se pidió explícitamente el modo de datos de prueba (API_MODE=mock)? Es la única forma de usar los mocks. */
export function modoMock(env: Env = process.env): boolean {
  return env.API_MODE === "mock";
}

/** ¿Hay un contrato configurado? Sin contrato y sin API_MODE=mock, la API responde 503 CONTRATO_NO_CONFIGURADO. */
export function hayChain(env: Env = process.env): boolean {
  return Boolean(env.CHEQUE_FUND_ADDRESS || leerDespliegue().chequeFund);
}

/** ARGt real de Base mainnet: la de ARGT_MAINNET_ADDRESS si es una dirección válida; si no, la verificada por defecto. */
export function argtMainnetDe(env: Env = process.env): Address {
  const a = env.ARGT_MAINNET_ADDRESS?.trim();
  return a && isAddress(a) ? a : (ARGT_MAINNET_POR_DEFECTO as Address);
}

/** Configuración completa. Lanza ConfigChainError si hay contrato pero faltan claves o direcciones inválidas. */
export function leerConfig(env: Env = process.env): ConfigChain {
  const desp = leerDespliegue();
  const chequeFund = env.CHEQUE_FUND_ADDRESS || desp.chequeFund;
  const mockArgt = env.MOCK_ARGT_ADDRESS || desp.mockARGt;
  if (!chequeFund || !mockArgt) throw new ConfigChainError("Falta CHEQUE_FUND_ADDRESS y MOCK_ARGT_ADDRESS (o shared/deployments/base-sepolia.json).");
  if (!isAddress(chequeFund) || !isAddress(mockArgt)) throw new ConfigChainError("CHEQUE_FUND_ADDRESS o MOCK_ARGT_ADDRESS no es una dirección válida.");

  const claves: Partial<Record<RolCuentaDemo, Hex>> = {};
  const direcciones = {} as Record<RolCuentaDemo, Address>;
  const faltan: string[] = [];
  for (const rol of Object.keys(VARIABLE_DE_CLAVE) as RolCuentaDemo[]) {
    const varClave = VARIABLE_DE_CLAVE[rol];
    const varDir = VARIABLE_DE_DIRECCION[rol];
    const valorClave = env[varClave]?.trim();
    const valorDir = varDir ? env[varDir]?.trim() : undefined;
    if (valorClave) {
      let dir: Address;
      try {
        dir = privateKeyToAddress(aHex(valorClave));
      } catch {
        throw new ConfigChainError(`${varClave} no es una clave privada válida.`);
      }
      claves[rol] = aHex(valorClave);
      direcciones[rol] = dir;
      if (varDir && valorDir) {
        if (!isAddress(valorDir)) throw new ConfigChainError(`${varDir} no es una dirección válida.`);
        if (valorDir.toLowerCase() !== dir.toLowerCase()) throw new ConfigChainError(`${varDir} no coincide con la dirección de ${varClave}.`);
      }
    } else if (varDir && valorDir) {
      if (!isAddress(valorDir)) throw new ConfigChainError(`${varDir} no es una dirección válida.`);
      direcciones[rol] = valorDir;
    } else {
      faltan.push(varDir ? `${varClave} o ${varDir}` : varClave);
    }
  }
  if (faltan.length > 0) throw new ConfigChainError(`Faltan variables de entorno: ${faltan.join(", ")}.`);

  const desde = (env.CHEQUE_FUND_FROM_BLOCK || (desp.bloqueDespliegue !== undefined ? String(desp.bloqueDespliegue) : "")).trim();
  if (!desde) {
    throw new ConfigChainError("Falta CHEQUE_FUND_FROM_BLOCK (el bloque donde se desplegó el contrato) o bloqueDespliegue en shared/deployments/base-sepolia.json.");
  }
  if (!/^\d+$/.test(desde)) throw new ConfigChainError("CHEQUE_FUND_FROM_BLOCK tiene que ser un número entero mayor o igual a 0.");
  return {
    rpcSepolia: env.BASE_SEPOLIA_RPC_URL || RPC_SEPOLIA_POR_DEFECTO,
    rpcMainnet: env.BASE_MAINNET_RPC_URL || RPC_MAINNET_POR_DEFECTO,
    chequeFund,
    mockArgt,
    desdeBloque: BigInt(desde),
    direcciones,
    claves,
    argtMainnet: argtMainnetDe(env),
  };
}
