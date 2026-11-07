import { describe, expect, it } from "vitest";
import demo from "@fixtures/cheques-demo.json";
import fixture from "@fixtures/mav-simulado.json";
import { consultarMavSimulado } from "./index";

describe("MAV simulado", () => {
  it("el fixture se declara simulado y cubre a todos los emisores de la demo", () => {
    expect(fixture.simulado).toBe(true);
    expect(fixture.fuente).toBe("MAV (simulado)");
    expect(fixture._nota).toMatch(/SIMULACIÓN/);
    const cuits = [...demo.cheques.map((c) => c.librador_cuit), demo.suplente.librador_cuit];
    for (const cuit of cuits) expect(Object.keys(fixture.emisores)).toContain(cuit);
  });

  it("devuelve los datos del emisor, siempre rotulados 'MAV (simulado)' y con una nota que lo dice", () => {
    const m = consultarMavSimulado("30703088534");
    expect(m.fuente).toBe("MAV (simulado)");
    expect(m.operaciones).toBeGreaterThan(0);
    expect(m.tasaPromedioTnaBps).toBeTypeOf("number");
    expect(m.plazoPromedioDias).toBeTypeOf("number");
    expect(m.ultimaOperacion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.nota).toMatch(/simulado/i);
    expect(m.nota).toMatch(/no proviene del MAV real/);
  });

  it("acepta el CUIT con guiones", () => {
    expect(consultarMavSimulado("30-70308853-4")).toEqual(consultarMavSimulado("30703088534"));
  });

  it("un CUIT desconocido no inventa nada: cero operaciones y sin cifras, pero igual rotulado", () => {
    const m = consultarMavSimulado("20000000001");
    expect(m).toMatchObject({ fuente: "MAV (simulado)", operaciones: 0, tasaPromedioTnaBps: null, plazoPromedioDias: null, ultimaOperacion: null });
    expect(m.nota).toMatch(/simulado/i);
  });

  it("todos los emisores del fixture dan una consulta rotulada como simulada", () => {
    for (const cuit of Object.keys(fixture.emisores)) {
      const m = consultarMavSimulado(cuit);
      expect(m.fuente).toBe("MAV (simulado)");
      expect(m.nota).toMatch(/simulado/i);
    }
  });
});
