// Estado de las wallets de demo (saldo de gas, de mARGt y KYC). Mock: cuentas de ejemplo.
import { leerCuentas } from "@/lib/chain";
import type { CuentaDemoEstado, RolCuentaDemo } from "@/shared/types";
import { bloqueDeCookie } from "../../_lib/bloque";
import { conChain } from "../../_lib/chain";

export const dynamic = "force-dynamic";

const ROLES: RolCuentaDemo[] = ["pyme", "inversor1", "inversor2", "originador", "oraculo", "admin"];

export async function GET(req?: Request) {
  return conChain(
    async (cfg) => Response.json(await leerCuentas(cfg, bloqueDeCookie(req))),
    () =>
      Response.json(
        ROLES.map((id, i): CuentaDemoEstado => ({ id, direccion: `0x${String(i + 1).padStart(40, "0")}`, eth: "0.1", argt: "0", kyc: id === "inversor1" })),
      ),
  );
}
