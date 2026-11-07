import { describe, expect, it } from "vitest";
import { formatFechaLiquidacion } from "./format";
import { liquidableDesdeEstimado, rescateVencido, validarCuotapartes } from "./rescates";

const iso = (d: Date) => d.toISOString();

describe("liquidableDesdeEstimado (Buenos Aires = UTC−3)", () => {
  it("viernes antes de las 15: vence a las 00:00 del lunes", () => {
    expect(iso(liquidableDesdeEstimado(new Date("2026-11-06T13:00:00Z")))).toBe("2026-11-09T03:00:00.000Z");
  });
  it("viernes después de las 15: cuenta desde el lunes, vence el martes", () => {
    expect(iso(liquidableDesdeEstimado(new Date("2026-11-06T19:00:00Z")))).toBe("2026-11-10T03:00:00.000Z");
  });
  it("sábado y domingo cuentan desde el lunes", () => {
    expect(iso(liquidableDesdeEstimado(new Date("2026-11-07T15:00:00Z")))).toBe("2026-11-10T03:00:00.000Z");
    expect(iso(liquidableDesdeEstimado(new Date("2026-11-08T15:00:00Z")))).toBe("2026-11-10T03:00:00.000Z");
  });
  it("lunes antes de las 15: vence el martes a las 00:00", () => {
    expect(iso(liquidableDesdeEstimado(new Date("2026-11-09T13:00:00Z")))).toBe("2026-11-10T03:00:00.000Z");
  });
  it("las 15:00 en punto ya cuentan como después del corte", () => {
    expect(iso(liquidableDesdeEstimado(new Date("2026-11-09T18:00:00Z")))).toBe("2026-11-11T03:00:00.000Z");
    expect(iso(liquidableDesdeEstimado(new Date("2026-11-09T17:59:00Z")))).toBe("2026-11-10T03:00:00.000Z");
  });
  it("usa la hora de Buenos Aires, no la UTC (01:00 UTC del sábado es viernes 22:00 en BA)", () => {
    expect(iso(liquidableDesdeEstimado(new Date("2026-11-07T01:00:00Z")))).toBe("2026-11-10T03:00:00.000Z");
  });
});

describe("formatFechaLiquidacion", () => {
  it("a medianoche de Buenos Aires muestra solo el día", () => {
    expect(formatFechaLiquidacion("2026-11-09T03:00:00.000Z")).toBe("lunes 9/11/2026");
  });
  it("con hora distinta de medianoche la agrega", () => {
    expect(formatFechaLiquidacion("2026-11-10T18:30:00.000Z")).toBe("martes 10/11/2026, 15:30 hs");
  });
  it("rechaza fechas inválidas", () => {
    expect(() => formatFechaLiquidacion("nada")).toThrow();
  });
});

describe("rescateVencido", () => {
  const r = { estado: "Pendiente" as const, liquidableDesde: "2026-11-09T03:00:00.000Z" };
  it("solo vence un pendiente cuya fecha ya pasó", () => {
    expect(rescateVencido(r, new Date("2026-11-09T03:00:00Z"))).toBe(true);
    expect(rescateVencido(r, new Date("2026-11-09T02:59:00Z"))).toBe(false);
    expect(rescateVencido({ ...r, estado: "Liquidado" }, new Date("2027-01-01T00:00:00Z"))).toBe(false);
  });
});

describe("validarCuotapartes", () => {
  it("acepta el formato es-AR: punto de miles y coma decimal", () => {
    expect(validarCuotapartes("5.000", "69995")).toEqual({ cuotapartes: "5000" });
    expect(validarCuotapartes("1,5", "69995")).toEqual({ cuotapartes: "1.5" });
    expect(validarCuotapartes(" 007 ", "10")).toEqual({ cuotapartes: "7" });
  });
  it("rechaza vacío, cero, texto y más de 6 decimales", () => {
    expect(validarCuotapartes("", "10")).toHaveProperty("error");
    expect(validarCuotapartes("0", "10")).toHaveProperty("error");
    expect(validarCuotapartes("abc", "10")).toHaveProperty("error");
    expect(validarCuotapartes("1,1234567", "10")).toHaveProperty("error");
  });
  it("no deja rescatar más de lo que tenés, y deja rescatar todo", () => {
    expect(validarCuotapartes("11", "10")).toEqual({ error: "Tenés 10 cuotapartes: no podés rescatar más." });
    expect(validarCuotapartes("10", "10")).toEqual({ cuotapartes: "10" });
    expect(validarCuotapartes("10,000001", "10")).toHaveProperty("error");
  });
});
