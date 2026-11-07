// Pegamento de las rutas con la capa chain: modo real si hay contrato configurado; los datos de prueba solo con API_MODE=mock.
// Sin contrato y sin API_MODE=mock responde 503: nunca se devuelve una tx falsa como si fuera real.
import { ConfigChainError, ErrorApi, hayChain, leerConfig, direccionDe, traducirError, type ConfigChain } from "@/lib/chain";
import { modoMock } from "@/lib/chain/config";
import { error } from "./http";

export const PYME_MOCK = "0x0000000000000000000000000000000000000001";

/** Ejecuta `real` con la configuración de la cadena si existe; `mock` solo con API_MODE=mock; si no, 503 CONTRATO_NO_CONFIGURADO. */
export async function conChain(real: (cfg: ConfigChain) => Promise<Response>, mock: () => Response | Promise<Response>): Promise<Response> {
  if (!hayChain()) {
    if (modoMock()) {
      try {
        return await mock();
      } catch (e) {
        if (e instanceof ErrorApi) return error(e.codigo, e.message, e.status);
        throw e;
      }
    }
    return error(
      "CONTRATO_NO_CONFIGURADO",
      "Falta configurar el contrato del fondo: definí CHEQUE_FUND_ADDRESS y MOCK_ARGT_ADDRESS (o completá shared/deployments/base-sepolia.json). Para desarrollar sin contrato, usá API_MODE=mock.",
      503,
    );
  }
  let cfg: ConfigChain;
  try {
    cfg = leerConfig();
  } catch (e) {
    return e instanceof ConfigChainError ? error("CONFIGURACION", e.message, 500) : error("CONFIGURACION", "Configuración inválida.", 500);
  }
  try {
    return await real(cfg);
  } catch (e) {
    const t = traducirError(e);
    return error(t.codigo, t.message, t.status);
  }
}

/** La wallet de demo de la pyme vive en el servidor: la UI no necesita conocerla. */
export function pymeDelServidor(): string {
  if (!hayChain()) return PYME_MOCK;
  try {
    return direccionDe(leerConfig(), "pyme");
  } catch {
    return PYME_MOCK;
  }
}

export { ErrorApi };
