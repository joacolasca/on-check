// Tope del tamaño del fondo en /api/demo/invertir (modo real simulado).
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ totalAssets: "100000000" }));
const invertirMock = vi.hoisted(() => vi.fn(async () => ({ tx: "0xabc", shares: "1" })));
vi.mock("@/lib/chain", async () => ({
  hayChain: () => true,
  leerConfig: () => ({}),
  direccionDe: () => "0x0",
  traducirError: (e: unknown) => ({ codigo: "X", message: String(e), status: 500 }),
  ConfigChainError: class extends Error {},
  ErrorApi: class extends Error {},
  invalidarEstado: () => undefined,
  leerCartera: async () => ({ totalAssets: estado.totalAssets, valorCuotaparte: "1000", exposicionPorLibrador: {} }),
  invertir: invertirMock,
  resolverSuscripcion: (await vi.importActual<typeof import("@/lib/chain/suscripcion")>("@/lib/chain/suscripcion")).resolverSuscripcion,
}));

import { reiniciarLimites } from "./_lib/acceso";
import { POST } from "./demo/invertir/route";

const CLAVE = "clave-de-prueba-0123456789";
// El tope se mide con las cuotapartes enteras que se suscriben, al valor de cuotaparte de la lectura ($ 1.000 en estos tests).
const inv = (cuotapartes: string) =>
  POST(new Request("http://localhost/api/demo/invertir", { method: "POST", headers: { "content-type": "application/json", "x-demo-clave": CLAVE }, body: JSON.stringify({ cuenta: "inversor1", cuotapartes }) }));

beforeEach(() => {
  vi.stubEnv("DEMO_CLAVE", CLAVE);
  vi.stubEnv("DEMO_TOPE_FONDO", "");
  reiniciarLimites();
  invertirMock.mockClear();
  estado.totalAssets = "100000000";
});

describe("tope del fondo", () => {
  it("por defecto (105.000.000) deja un depósito chico en vivo", async () => {
    expect((await inv("5000")).status).toBe(200); // $ 5.000.000
  });
  it("por encima del tope del fondo → 400 y no firma nada", async () => {
    const r = await inv("5001"); // $ 5.001.000: el fondo quedaría en $ 105.001.000
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: { codigo: string } }).error.codigo).toBe("DATOS_INVALIDOS");
    expect(invertirMock).not.toHaveBeenCalled();
  });
  it("una suscripción por debajo del mínimo no firma nada (MINIMO_CUOTAPARTES)", async () => {
    const r = await inv("999");
    expect(r.status).toBe(500); // el mock de traducirError de este archivo no conoce los códigos; lo que importa es que no firma
    expect(invertirMock).not.toHaveBeenCalled();
  });
  it("respeta DEMO_TOPE_FONDO", async () => {
    vi.stubEnv("DEMO_TOPE_FONDO", "101000000");
    expect((await inv("1000")).status).toBe(200); // $ 1.000.000: justo en el tope
    estado.totalAssets = "101000000";
    expect((await inv("1000")).status).toBe(400);
  });
});
