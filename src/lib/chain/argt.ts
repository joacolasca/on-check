// ARGt real en Base mainnet: solo lectura (D6). No necesita el contrato de la demo.
import { erc20Abi } from "viem";
import type { ArgtReal } from "@/shared/types";
import { clienteMainnet } from "./clientes";
import { argtMainnetDe, RPC_MAINNET_POR_DEFECTO } from "./config";
import { traducirError } from "./errores";

export async function leerArgtReal(env: Record<string, string | undefined> = process.env): Promise<ArgtReal> {
  const direccion = argtMainnetDe(env);
  try {
    const supply = await clienteMainnet(env.BASE_MAINNET_RPC_URL || RPC_MAINNET_POR_DEFECTO).readContract({ address: direccion, abi: erc20Abi, functionName: "totalSupply" });
    return { totalSupply: supply.toString(), fuente: "base-mainnet", direccion };
  } catch (e) {
    throw traducirError(e);
  }
}
