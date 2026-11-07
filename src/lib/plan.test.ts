import { describe, expect, it } from "vitest";
import { REGLAS_POR_DEFECTO, decidirPeriodo, etiquetaPeriodo, validarReglas, type ReglasPlan } from "./plan";

const r = (p: Partial<ReglasPlan> = {}): ReglasPlan => ({ ...REGLAS_POR_DEFECTO, ...p });

describe("plan automático", () => {
  it("compra cuando la cuotaparte está en el máximo o por debajo", () => {
    const d = decidirPeriodo(r(), "999.98", "0");
    expect(d.accion).toBe("comprar");
    expect(d.cuotapartes).toBe("1000");
    expect(d.explicacion).toContain("$ 999,98");
    expect(decidirPeriodo(r(), "1000", "0").accion).toBe("comprar");
  });

  it("espera cuando la cuotaparte supera el máximo", () => {
    const d = decidirPeriodo(r({ precioMaxCompra: "950" }), "999.98", "0");
    expect(d.accion).toBe("esperar");
    expect(d.cuotapartes).toBe("0");
    expect(d.explicacion).toContain("por encima de tu máximo de $ 950");
  });

  it("vende cuando llega al precio de venta y tiene cuotapartes; si no tiene, espera", () => {
    const reglas = r({ precioMaxCompra: "900", precioVenta: "990", cuotapartesVenta: "500" });
    expect(decidirPeriodo(reglas, "999.98", "1000").accion).toBe("vender");
    expect(decidirPeriodo(reglas, "999.98", "1000").cuotapartes).toBe("500");
    expect(decidirPeriodo(reglas, "999.98", "100").accion).toBe("esperar");
  });

  it("la venta tiene prioridad sobre la compra", () => {
    expect(decidirPeriodo(r({ precioMaxCompra: "1000", precioVenta: "1000.5" }), "1001", "2000").accion).toBe("vender");
  });

  it("valida las reglas", () => {
    expect(validarReglas(r())).toBeNull();
    expect(validarReglas(r({ cuotapartesPorCompra: "999" }))).toMatch(/1\.000/);
    expect(validarReglas(r({ cuotapartesPorCompra: "1000.5" }))).toMatch(/fracciones/);
    expect(validarReglas(r({ precioMaxCompra: "0" }))).toMatch(/mayor a cero/);
    expect(validarReglas(r({ precioVenta: "900" }))).toMatch(/mayor al precio máximo/);
    expect(validarReglas(r({ periodos: 7 }))).toMatch(/1 a 6/);
  });

  it("nombra los períodos según la frecuencia", () => {
    expect(etiquetaPeriodo("semanal", 2)).toBe("Semana 2");
    expect(etiquetaPeriodo("mensual", 1)).toBe("Mes 1");
  });

  it("no promete rendimiento", () => {
    for (const d of [decidirPeriodo(r(), "999", "0"), decidirPeriodo(r({ precioMaxCompra: "1" }), "999", "0")]) {
      expect(d.explicacion).not.toMatch(/rinde|rendimiento|ganancia/i);
    }
  });
});
