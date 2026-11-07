// Sin contrato configurado la API no inventa datos: 503 salvo que se pida API_MODE=mock explícitamente.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TX_FALSA } from "./_lib/http";

const CLAVE = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DIR = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const json = async <T>(r: Response) => (await r.json()) as T;
const peticion = (cuerpo: unknown) => new Request("http://localhost/api/cheques", { method: "POST", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } });
const CHEQUE = { cotizacionId: "0x" + "12".repeat(32) };

beforeEach(() => {
  vi.stubEnv("CHEQUE_FUND_ADDRESS", "");
  vi.stubEnv("MOCK_ARGT_ADDRESS", "");
  vi.stubEnv("API_MODE", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("sin contrato y sin API_MODE", () => {
  it("GET /api/fondo y GET /api/cheques responden 503 CONTRATO_NO_CONFIGURADO", async () => {
    for (const ruta of ["@/app/api/fondo/route", "@/app/api/cheques/route"]) {
      const r = await (await import(/* @vite-ignore */ ruta)).GET();
      expect(r.status).toBe(503);
      const e = await json<{ error: { codigo: string; mensaje: string } }>(r);
      expect(e.error.codigo).toBe("CONTRATO_NO_CONFIGURADO");
      expect(e.error.mensaje).toMatch(/configurar/);
    }
  });
  it("POST /api/cheques responde 503 y nunca una tx falsa", async () => {
    const r = await (await import("@/app/api/cheques/route")).POST(peticion(CHEQUE));
    const texto = await r.text();
    expect(r.status).toBe(503);
    expect(texto).toContain("CONTRATO_NO_CONFIGURADO");
    expect(texto).not.toContain(TX_FALSA);
  });
});

describe("con API_MODE=mock", () => {
  beforeEach(() => vi.stubEnv("API_MODE", "mock"));
  it("devuelve los mocks de siempre", async () => {
    const f = await json<{ direccionContrato: string }>(await (await import("@/app/api/fondo/route")).GET());
    expect(f.direccionContrato).toBe("0x0000000000000000000000000000000000000000");
    const c = await json<unknown[]>(await (await import("@/app/api/cheques/route")).GET());
    expect(c.length).toBe(7);
    const r = await (await import("@/app/api/cheques/route")).POST(peticion(CHEQUE));
    expect(r.status).toBe(200);
  });
});

describe("contrato configurado pero sin bloque de inicio", () => {
  it("responde 500 CONFIGURACION, no lee en silencio los últimos bloques", async () => {
    vi.stubEnv("CHEQUE_FUND_ADDRESS", DIR);
    vi.stubEnv("MOCK_ARGT_ADDRESS", DIR);
    vi.stubEnv("CHEQUE_FUND_FROM_BLOCK", "");
    for (const k of ["DEPLOYER", "ORIGINADOR", "ORACULO", "INVERSOR1", "INVERSOR2", "PYME"]) vi.stubEnv(`${k}_PRIVATE_KEY`, CLAVE);
    for (const malo of ["", "abc", "-1"]) {
      vi.stubEnv("CHEQUE_FUND_FROM_BLOCK", malo);
      const r = await (await import("@/app/api/fondo/route")).GET();
      expect(r.status).toBe(500);
      expect((await json<{ error: { codigo: string } }>(r)).error.codigo).toBe("CONFIGURACION");
    }
  });
});
