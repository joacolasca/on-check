import { describe, expect, it } from "vitest";
import {
  ETIQUETA_ESTADO,
  formatBps,
  formatDecimal,
  formatFecha,
  formatPesos,
  hashCorto,
  multiplicarDecimales,
  unidadesADecimal,
} from "./format";

describe("formatPesos", () => {
  it("agrupa con puntos y no muestra centavos si no hay", () => {
    expect(formatPesos("10000000")).toBe("$ 10.000.000");
    expect(formatPesos("0")).toBe("$ 0");
    expect(formatPesos("999")).toBe("$ 999");
  });
  it("muestra centavos con coma y redondea half-up", () => {
    expect(formatPesos("427397.5")).toBe("$ 427.397,50");
    expect(formatPesos("1.005")).toBe("$ 1,01");
    expect(formatPesos("9572603.0")).toBe("$ 9.572.603");
  });
  it("no pierde precisión con montos enormes", () => {
    expect(formatPesos("123456789012345678901")).toBe("$ 123.456.789.012.345.678.901");
  });
  it("rechaza basura", () => {
    expect(() => formatPesos("abc")).toThrow();
  });
});

describe("formatDecimal", () => {
  it("usa coma y recorta ceros", () => {
    expect(formatDecimal("1.0")).toBe("1");
    expect(formatDecimal("1.2345678")).toBe("1,2346");
    expect(formatDecimal("1.05", 4, 2)).toBe("1,05");
    expect(formatDecimal("1", 4, 2)).toBe("1,00");
  });
});

describe("unidadesADecimal y multiplicarDecimales", () => {
  it("convierte wei a decimal", () => {
    expect(unidadesADecimal("1000000000000000000000000")).toBe("1000000");
    expect(unidadesADecimal("1500000000000000000")).toBe("1.5");
    expect(unidadesADecimal("1")).toBe("0.000000000000000001");
  });
  it("multiplica sin usar number", () => {
    expect(multiplicarDecimales("20000000", "1.0")).toBe("20000000");
    expect(multiplicarDecimales("1.5", "2.5")).toBe("3.75");
    expect(multiplicarDecimales("0.1", "0.2")).toBe("0.02");
  });
});

describe("formatFecha", () => {
  it("devuelve D/M/AAAA", () => {
    expect(formatFecha("2027-01-05")).toBe("5/1/2027");
    expect(formatFecha("2026-12-04T10:00:00.000Z")).toBe("4/12/2026");
  });
  it("rechaza fechas inválidas", () => {
    expect(() => formatFecha("05/01/2027")).toThrow();
  });
});

describe("formatBps", () => {
  it("convierte basis points a porcentaje", () => {
    expect(formatBps(2600)).toBe("26 %");
    expect(formatBps(1180)).toBe("11,8 %");
    expect(formatBps(4000)).toBe("40 %");
    expect(formatBps(1)).toBe("0,01 %");
  });
});

describe("hashCorto y estados", () => {
  it("acorta hashes", () => {
    expect(hashCorto("0x" + "ab".repeat(32))).toBe("0xabab…abab");
  });
  it("las etiquetas de estado nunca dicen que ARGt rinde", () => {
    for (const e of Object.values(ETIQUETA_ESTADO)) expect(e).not.toMatch(/rinde|rendimiento/i);
  });
});

import { restarDecimales, sumarDecimales } from "./format";

describe("sumarDecimales y restarDecimales", () => {
  it("suma sin errores de coma flotante", () => {
    expect(sumarDecimales("0.1", "0.2")).toBe("0.3");
    expect(sumarDecimales("20000000", "10000000.5")).toBe("30000000.5");
    expect(sumarDecimales("0", "0")).toBe("0");
  });
  it("resta y devuelve signo", () => {
    expect(restarDecimales("10", "4.5")).toBe("5.5");
    expect(restarDecimales("4.5", "10")).toBe("-5.5");
    expect(restarDecimales("3", "3")).toBe("0");
  });
});
