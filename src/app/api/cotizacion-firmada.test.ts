// Rutas: validación de entrada y pyme del servidor (modo real simulado: la cadena no se toca).
import { beforeEach, describe, expect, it, vi } from "vitest";

const PYME_SERVIDOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const mocks = vi.hoisted(() => ({
  registrar: vi.fn(async (_cfg: unknown, id: string) => ({ chequeId: id, tx: "0x1" })),
  fondear: vi.fn(async () => ({ tx: "0x1" })),
  liquidar: vi.fn(async () => ({ tx: "0x1" })),
}));
vi.mock("@/lib/chain", async (original) => ({
  ...(await original<typeof import("@/lib/chain")>()),
  hayChain: () => true,
  leerConfig: () => ({}),
  direccionDe: () => "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  registrarCheque: mocks.registrar,
  fondearCheque: mocks.fondear,
  liquidarCheque: mocks.liquidar,
}));

import { reiniciarLimites } from "./_lib/acceso";
import { POST as cotizarPOST } from "./cotizar/route";
import { POST as chequesPOST } from "./cheques/route";
import { POST as fondearPOST } from "./cheques/[id]/fondear/route";
import { POST as liquidarPOST } from "./demo/liquidar/route";

const CLAVE = "clave-de-prueba-0123456789";
const post = (ruta: string, body: unknown) =>
  new Request(`http://localhost${ruta}`, { method: "POST", headers: { "content-type": "application/json", "x-demo-clave": CLAVE }, body: JSON.stringify(body) });
const hoyMas = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const codigo = async (r: Response) => ((await r.json()) as { error: { codigo: string } }).error.codigo;

beforeEach(() => {
  vi.stubEnv("DEMO_CLAVE", CLAVE);
  vi.stubEnv("BCRA_MODE", "cache");
  vi.stubEnv("COTIZACION_SECRETO", "s".repeat(40));
  reiniciarLimites();
  for (const m of Object.values(mocks)) m.mockClear();
});

describe("/api/cotizar", () => {
  it("con contrato ignora body.pyme y usa la del servidor; la cotización sale firmada", async () => {
    const r = await cotizarPOST(post("/api/cotizar", { cuit: "30703088534", nominal: "1000000", vencimiento: hoyMas(30), pyme: "0x00000000000000000000000000000000000000Aa" }));
    expect(r.status).toBe(200);
    const cot = (await r.json()) as { input: { pyme: string }; firma?: string };
    expect(cot.input.pyme).toBe(PYME_SERVIDOR);
    expect(cot.firma).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });

  it("vencimiento inválido (fecha imposible o texto) → 400 DATOS_INVALIDOS", async () => {
    for (const vencimiento of ["2027-02-30", "foo", "2027-2-3", "2026-13-01", "2027-01-02T00:00:00Z"]) {
      const r = await cotizarPOST(post("/api/cotizar", { cuit: "30703088534", nominal: "1000000", vencimiento }));
      expect(r.status, vencimiento).toBe(400);
      expect(await codigo(r)).toBe("DATOS_INVALIDOS");
    }
  });
});

describe("chequeId inválido → 400 sin tocar la blockchain", () => {
  const malos = ["foo", "0x1234", "0x" + "zz".repeat(32), "0x" + "ab".repeat(33)];
  it("POST /api/cheques", async () => {
    for (const cotizacionId of malos) {
      const r = await chequesPOST(post("/api/cheques", { cotizacionId }));
      expect(r.status).toBe(400);
      expect(await codigo(r)).toBe("DATOS_INVALIDOS");
    }
    expect(mocks.registrar).not.toHaveBeenCalled();
  });
  it("POST /api/cheques/:id/fondear", async () => {
    for (const id of malos) {
      const r = await fondearPOST(post("/x", {}), { params: Promise.resolve({ id }) });
      expect(r.status).toBe(400);
    }
    expect(mocks.fondear).not.toHaveBeenCalled();
  });
  it("POST /api/demo/liquidar", async () => {
    for (const chequeId of malos) {
      const r = await liquidarPOST(post("/api/demo/liquidar", { chequeId, resultado: "pagado" }));
      expect(r.status).toBe(400);
    }
    expect(mocks.liquidar).not.toHaveBeenCalled();
  });
  it("un id válido sigue pasando", async () => {
    const id = "0x" + "ab".repeat(32);
    expect((await chequesPOST(post("/api/cheques", { cotizacionId: id }))).status).toBe(200);
    expect((await fondearPOST(post("/x", {}), { params: Promise.resolve({ id }) })).status).toBe(200);
    expect((await liquidarPOST(post("/api/demo/liquidar", { chequeId: id, resultado: "pagado" }))).status).toBe(200);
  });
});
