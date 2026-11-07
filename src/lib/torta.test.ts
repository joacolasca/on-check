import { describe, expect, it } from "vitest";
import type { PorcionComposicion } from "@/shared/types";
import { angulosPorciones, armarPorciones, porcionesDe, repartirPermil, trazoAnillo } from "./torta";

const p = (clave: string, etiqueta: string, monto: string): PorcionComposicion => ({ clave, etiqueta, monto, bps: 0 });

describe("repartirPermil", () => {
  it("siempre suma 1000, aunque los redondeos individuales no cierren", () => {
    const r = repartirPermil([1n, 1n, 1n]); // 333,3 cada una
    expect(r.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(r).toEqual([334, 333, 333]);
  });
  it("reparte por resto mayor, no por orden", () => {
    const r = repartirPermil([9500000n, 9000000n, 8500000n, 8000000n, 7200000n, 16800000n]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(1000);
  });
  it("todo en cero da ceros; un solo valor da 1000", () => {
    expect(repartirPermil([0n, 0n])).toEqual([0, 0]);
    expect(repartirPermil([5n])).toEqual([1000]);
  });
});

describe("armarPorciones", () => {
  it("ordena de mayor a menor y descarta montos en cero", () => {
    const r = armarPorciones([p("a", "A", "10"), p("b", "B", "0"), p("c", "C", "30"), p("d", "D", "20")]);
    expect(r.map((x) => x.clave)).toEqual(["c", "d", "a"]);
    expect(r.reduce((a, x) => a + x.permil, 0)).toBe(1000);
  });
  it("agrupa la cola en Otros (n) cuando hay más de 6", () => {
    const lista = Array.from({ length: 9 }, (_, i) => p(`k${i}`, `E${i}`, String(100 - i)));
    const r = armarPorciones(lista);
    expect(r).toHaveLength(6);
    expect(r[5].etiqueta).toBe("Otros (4)");
    expect(r[5].agrupada).toBe(true);
    expect(r[5].monto).toBe(String(95 + 94 + 93 + 92));
    expect(r.reduce((a, x) => a + x.permil, 0)).toBe(1000);
  });
  it("con exactamente 6 no agrupa", () => {
    const r = armarPorciones(Array.from({ length: 6 }, (_, i) => p(`k${i}`, `E${i}`, String(10 + i))));
    expect(r.some((x) => x.agrupada)).toBe(false);
  });
  it("asigna colores de los tokens, y gris para Otros", () => {
    const r = armarPorciones(Array.from({ length: 8 }, (_, i) => p(`k${i}`, `E${i}`, String(50 - i))));
    expect(r[0].color).toBe("var(--serie-1)");
    expect(r[5].color).toBe("var(--serie-otros)");
  });
  it("desempata por etiqueta para que el orden sea estable", () => {
    const r = armarPorciones([p("z", "Zeta", "10"), p("a", "Alfa", "10")]);
    expect(r.map((x) => x.etiqueta)).toEqual(["Alfa", "Zeta"]);
  });
  it("sin porciones devuelve vacío", () => {
    expect(armarPorciones([])).toEqual([]);
  });
});

describe("porcionesDe", () => {
  const c = { porEmisor: [p("e", "E", "1")], porIndustria: [p("i", "I", "1")], porTipo: [p("cheque", "x", "1"), p("pagare", "y", "1")] };
  it("elige el desglose y rotula cheques y pagarés en castellano", () => {
    expect(porcionesDe(c, "emisor")[0].clave).toBe("e");
    expect(porcionesDe(c, "industria")[0].clave).toBe("i");
    expect(porcionesDe(c, "tipo").map((x) => x.etiqueta)).toEqual(["Cheques", "Pagarés"]);
  });
});

describe("geometría", () => {
  it("los ángulos cubren la vuelta completa y arrancan a las 12", () => {
    const a = angulosPorciones([500, 250, 250]);
    expect(a[0].inicio).toBeCloseTo(-Math.PI / 2);
    expect(a[2].fin).toBeCloseTo(Math.PI * 1.5);
    expect(a[1].inicio).toBeCloseTo(a[0].fin);
  });
  it("un sector es un trazo cerrado con dos arcos", () => {
    const d = trazoAnillo(100, 100, 90, 60, -Math.PI / 2, 0);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect((d.match(/A /g) ?? []).length).toBe(2);
  });
  it("el 100 % se dibuja como anillo completo (dos círculos)", () => {
    const d = trazoAnillo(100, 100, 90, 60, -Math.PI / 2, (Math.PI * 3) / 2);
    expect((d.match(/Z/g) ?? []).length).toBe(2);
  });
  it("marca el arco grande cuando pasa de media vuelta", () => {
    expect(trazoAnillo(100, 100, 90, 60, 0, Math.PI * 1.2)).toContain("A 90 90 0 1 1");
    expect(trazoAnillo(100, 100, 90, 60, 0, Math.PI * 0.5)).toContain("A 90 90 0 0 1");
  });
});
