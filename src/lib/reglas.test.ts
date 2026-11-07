import { describe, expect, it } from "vitest";
import type { ResumenFondo } from "@/shared/types";
import fondoJson from "@fixtures/ui/fondo.json";
import { formatBps } from "./format";
import { consumosReglas, escalaBarra, mayorPorcion, reglasInformativas } from "./reglas";

const fondo = fondoJson as unknown as ResumenFondo;

describe("consumosReglas", () => {
  const [emisor, industria, liquidez] = consumosReglas(fondo);
  it("mide el mayor emisor contra el 10 % sobre el patrimonio", () => {
    expect(emisor.limiteBps).toBe(1000);
    expect(emisor.actualBps).toBe(950); // $ 9.500.000 de $ 100.000.000
    expect(emisor.cumple).toBe(true);
    expect(emisor.detalle).toMatch(/PAMPA/);
  });
  it("mide la mayor industria contra el 25 %", () => {
    expect(industria.limiteBps).toBe(2500);
    expect(industria.actualBps).toBe(1570);
    expect(industria.cumple).toBe(true);
  });
  it("la liquidez es un mínimo", () => {
    expect(liquidez.tipo).toBe("minimo");
    expect(liquidez.actualBps).toBe(4100);
    expect(liquidez.cumple).toBe(true);
  });
  it("marca fuera de la regla cuando se pasa", () => {
    const roto = { ...fondo, liquidezBps: 1000, composicion: { ...fondo.composicion, porEmisor: [{ clave: "x", etiqueta: "X", monto: "12000000", bps: 0 }] } };
    const r = consumosReglas(roto);
    expect(r[0].cumple).toBe(false);
    expect(r[2].cumple).toBe(false);
  });
  it("sin cartera cae a la concentración que informa la API", () => {
    const vacio = { ...fondo, concentracionMaxBps: 0, composicion: { porEmisor: [], porIndustria: [], porTipo: [] } };
    expect(consumosReglas(vacio)[0].actualBps).toBe(0);
    expect(consumosReglas(vacio)[0].detalle).toMatch(/Todavía no hay cartera/);
  });
});

describe("reglasInformativas", () => {
  const r = reglasInformativas(fondo, formatBps);
  it("el objetivo siempre dice que no está garantizado", () => {
    const o = r.find((x) => x.id === "objetivo");
    expect(o?.valor).toBe("40 % TNA");
    expect(o?.detalle).toMatch(/no garantizado/);
  });
  it("muestra comisión y plazo de rescate", () => {
    expect(r.find((x) => x.id === "comision")?.valor).toBe("3 % anual");
    expect(r.find((x) => x.id === "rescate")?.valor).toBe("24 horas hábiles");
    expect(r.find((x) => x.id === "rescate")?.detalle).toMatch(/15 hs/);
  });
  it("muestra la suscripción mínima: 1.000 cuotapartes, de a 1", () => {
    const s = r.find((x) => x.id === "suscripcion");
    expect(s?.valor).toBe("1.000 cuotapartes, de a 1");
    expect(s?.detalle).toMatch(/al valor de hoy/);
  });
  it("no promete rendimientos", () => {
    expect(JSON.stringify(r)).not.toMatch(/rinde|rendimiento/i);
  });
});

describe("escalaBarra y mayorPorcion", () => {
  it("el límite queda en el medio de la barra", () => {
    expect(escalaBarra(500, 1000)).toEqual({ rellenoPct: 25, marcaPct: 50 });
  });
  it("si se pasa del doble del límite, la escala crece", () => {
    const e = escalaBarra(3000, 1000);
    expect(e.rellenoPct).toBe(100);
    expect(e.marcaPct).toBeCloseTo(33.3, 1);
  });
  it("mayorPorcion ignora montos en cero", () => {
    expect(mayorPorcion([{ clave: "a", etiqueta: "A", monto: "0", bps: 0 }])).toBeNull();
    expect(mayorPorcion([{ clave: "a", etiqueta: "A", monto: "5", bps: 0 }, { clave: "b", etiqueta: "B", monto: "7", bps: 0 }])?.clave).toBe("b");
  });
});
