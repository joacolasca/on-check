import { erc20Abi, type Abi } from "viem";
import argt from "@/shared/abi/MockARGt.json";
import fondo from "@/shared/abi/ChequeFund.json";
import token from "@/shared/abi/ChequeToken.json";

// ABI real de los contratos v2, exportado de `contracts/` con `pnpm abi`. Si cambia el contrato, volver a correrlo y commitear.
export const ABI_FONDO = fondo as Abi;
export const ABI_TOKEN = token as Abi;
export const ABI_ARGT = argt as Abi;
export const ABI_ERC20 = erc20Abi;
