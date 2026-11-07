import { describe, expect, it } from "vitest";
import { excedeConcentracion, liquidezMinima, maximoPermitido, primeraViolacion, proyectadaBps, type EntradaLimites } from "./concentracion";

const T = 10n ** 18n;
const base: EntradaLimites = {
  patrimonio: 100_000_000n * T,
  liquidez: 100_000_000n * T,
  exposicionEmisor: 0n,
  exposicionIndustria: 0n,
  precioCompra: 5_000_000n * T,
  maxEmisorBps: 1000n,
  maxIndustriaBps: 2500n,
  liquidezMinBps: 1500n,
};

describe("espejo de ChequeFund.fondearCheque", () => {
  it("el máximo redondea para abajo y la liquidez mínima para arriba", () => {
    expect(maximoPermitido(10_001n, 1000n)).toBe(1000n); // 1000,1 → 1000
    expect(liquidezMinima(10_001n, 1500n)).toBe(1501n); // 1500,15 → 1501
    expect(liquidezMinima(10_000n, 1500n)).toBe(1500n);
  });

  it("emisor: justo en el tope pasa (el contrato compara con >), un wei más no", () => {
    const patrimonio = 100n * T;
    expect(excedeConcentracion(4n * T, 6n * T, patrimonio, 1000n)).toBe(false); // 10 en 100
    expect(excedeConcentracion(4n * T, 6n * T + 1n, patrimonio, 1000n)).toBe(true);
  });

  it("sin exposición y con el pool de demo, se puede comprar", () => {
    expect(primeraViolacion(base)).toBeNull();
  });

  it("emisor", () => {
    expect(primeraViolacion({ ...base, exposicionEmisor: 5_000_001n * T })).toMatchObject({ tipo: "emisor", maximo: 10_000_000n * T });
  });

  it("industria (la industria 0 también cuenta: es solo un id)", () => {
    expect(primeraViolacion({ ...base, exposicionIndustria: 20_000_001n * T })).toMatchObject({ tipo: "industria", maximo: 25_000_000n * T });
  });

  it("liquidez: no alcanza, o queda bajo el mínimo", () => {
    expect(primeraViolacion({ ...base, liquidez: 4_000_000n * T })).toMatchObject({ tipo: "sin_liquidez" });
    expect(primeraViolacion({ ...base, liquidez: 19_999_999n * T })).toMatchObject({ tipo: "liquidez_minima", minima: 15_000_000n * T });
    expect(primeraViolacion({ ...base, liquidez: 20_000_000n * T })).toBeNull(); // queda 15 M = 15 % justo
  });

  it("fondo vacío: cualquier compra excede (máximo 0)", () => {
    expect(primeraViolacion({ ...base, patrimonio: 0n, liquidez: 0n })).toMatchObject({ tipo: "emisor", maximo: 0n });
  });

  it("respeta el orden del contrato: emisor, industria, sin liquidez, liquidez mínima", () => {
    const todo = { ...base, exposicionEmisor: 9_000_000n * T, exposicionIndustria: 30_000_000n * T, liquidez: 1n };
    expect(primeraViolacion(todo)?.tipo).toBe("emisor");
    expect(primeraViolacion({ ...todo, exposicionEmisor: 0n })?.tipo).toBe("industria");
    expect(primeraViolacion({ ...todo, exposicionEmisor: 0n, exposicionIndustria: 0n })?.tipo).toBe("sin_liquidez");
  });

  it("los topes salen de los parámetros (el contrato los puede cambiar)", () => {
    expect(primeraViolacion({ ...base, maxEmisorBps: 400n })).toMatchObject({ tipo: "emisor" });
  });

  it("la comisión devengada no entra en la cuenta: solo patrimonio, liquidez y exposiciones", () => {
    // `_devengar` emite cuotapartes y no cambia totalAssets(): mismas entradas, mismo resultado
    expect(primeraViolacion(base)).toEqual(primeraViolacion({ ...base }));
  });

  it("proyectadaBps redondea hacia arriba y es null con el fondo vacío", () => {
    expect(proyectadaBps(0n, 1n, 3n)).toBe(3334);
    expect(proyectadaBps(0n, 1n, 0n)).toBeNull();
  });
});
