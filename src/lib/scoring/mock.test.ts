import { describe, expect, it } from "vitest";
import { CONFIG_FONDO } from "./config";
import { cotizarMock as cotizar, scoreLibradorMock as scoreLibrador } from "./mock";

describe("scoring mock", () => {
  it("scoreLibrador devuelve la forma de ResultadoScoring", async () => {
    const r = await scoreLibrador("30000000000");
    expect(r.cuit).toBe("30000000000");
    expect(r.puntaje).toBeGreaterThanOrEqual(0);
    expect(r.puntaje).toBeLessThanOrEqual(100);
    expect(["A", "B", "C", "D"]).toContain(r.banda);
    expect(Array.isArray(r.ajustes)).toBe(true);
    expect(["bcra-live", "bcra-cache"]).toContain(r.fuente);
    expect(Number.isNaN(Date.parse(r.consultadoEn))).toBe(false);
  });

  it("cotizar devuelve la forma de Cotizacion con montos como string", async () => {
    const input = { cuit: "30000000000", nominal: "10000000", vencimiento: "2027-01-05", pyme: "0x0000000000000000000000000000000000000001" };
    const c = cotizar(input, await scoreLibrador(input.cuit), CONFIG_FONDO);
    expect(c.input).toEqual(input);
    expect(c.id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(c.libradorHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(c.cotizacionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(typeof c.descuento).toBe("string");
    expect(typeof c.precioCompra).toBe("string");
    expect(c.explicacion).not.toMatch(/rinde/i);
  });
});
