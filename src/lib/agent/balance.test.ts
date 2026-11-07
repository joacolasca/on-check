import { describe, expect, it } from "vitest";
import { analizarBalance, leerMonto, SIN_BALANCE } from "./balance";

describe("leerMonto", () => {
  it.each([
    ["$ 12.500.000", "12500000"],
    ["12.500.000,50", "12500000.5"],
    ["12,500,000.50", "12500000.5"],
    ["1.234", "1234"],
    ["1234,5", "1234.5"],
    ["0,75", "0.75"],
    ["8000000", "8000000"],
  ])("%s → %s", (crudo, esperado) => expect(leerMonto(crudo)).toBe(esperado));
  it("devuelve null si no es un monto", () => expect(leerMonto("abc")).toBeNull());
});

describe("analizarBalance", () => {
  it("sin balance lo dice y no inventa cifras", () => {
    for (const t of [undefined, "", "   \n"]) {
      expect(analizarBalance(t)).toEqual({ disponible: false, ventas: null, deuda: null, liquidez: null, patrimonio: null, resumen: SIN_BALANCE });
    }
    expect(SIN_BALANCE).toMatch(/solo en la Central de Deudores del BCRA/);
  });

  it("extrae ventas, deuda, liquidez y patrimonio de un texto pegado", () => {
    const b = analizarBalance(
      ["Balance 2025", "Ventas netas: $ 1.250.000.000", "Deuda financiera: 300.000.000,50", "Caja y bancos $ 90.000.000", "Patrimonio neto 450.000.000"].join("\n"),
    );
    expect(b).toMatchObject({ disponible: true, ventas: "1250000000", deuda: "300000000.5", liquidez: "90000000", patrimonio: "450000000" });
    expect(b.resumen).toMatch(/ventas \$ 1\.250\.000\.000/);
    expect(b.resumen).toMatch(/sin auditar/);
  });

  it("salta los años y las notas, y usa solo números que están en el texto", () => {
    const b = analizarBalance("Ventas 2025: 5.000.000.");
    expect(b.ventas).toBe("5000000");
    expect(b.deuda).toBeNull();
    expect(b.resumen).toMatch(/No encontré: deuda, liquidez, patrimonio/);
  });

  it("un ratio de liquidez corriente no se toma como monto en pesos", () => {
    expect(analizarBalance("Liquidez corriente: 1,35").liquidez).toBeNull();
  });

  it("si no entiende nada, lo dice y no completa", () => {
    const b = analizarBalance("Este es un texto cualquiera sin cifras del balance.");
    expect(b).toMatchObject({ disponible: true, ventas: null, deuda: null, liquidez: null, patrimonio: null });
    expect(b.resumen).toMatch(/no pude leer/);
  });

  it("avisa si el texto parece estar en miles, sin convertir", () => {
    const b = analizarBalance("Estado de situación (en miles de pesos)\nVentas: 120.000");
    expect(b.ventas).toBe("120000");
    expect(b.resumen).toMatch(/expresado en miles: no convertí/);
  });
});
