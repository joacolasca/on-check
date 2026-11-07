import { describe, expect, it } from "vitest";
import type { ChequeVista, EstadoCheque, ResumenFondo } from "@/shared/types";
import fondoJson from "@fixtures/ui/fondo.json";
import { POLITICA_POR_DEFECTO } from "./chain/politica";
import { formatBps } from "./format";
import { objetivo } from "./politicas";
import { formatPuntajeCentesimas, metricasCartera, objetivoBrutoBps, puntajeDeEquilibrio, textosRentabilidad } from "./rentabilidad";
import { CONFIG_FONDO, tasaPorPuntaje } from "./scoring/config";

const POL = { objetivoTnaBps: 4000, comisionAnualBps: 300 };

function ch(precio: string, puntaje: number, tasaTnaBps: number, estado: EstadoCheque = "Funded"): ChequeVista {
  return {
    id: "1", libradorHashCorto: "0x9f3a…c41e", nominal: precio, precioCompra: precio, vencimiento: "2026-12-01",
    puntaje, banda: "A", tasaTnaBps, estado, explicacion: "", txs: [],
    tipo: "cheque", industria: "Servicios", emisorNombre: null, garantia: null,
  };
}

describe("metricasCartera", () => {
  it("pondera por capital, no promedia simple", () => {
    const m = metricasCartera([ch("9000000", 100, 3000), ch("1000000", 70, 6000)], POL)!;
    expect(m.puntajePromedioCentesimas).toBe(9700);
    expect(m.tasaBrutaBps).toBe(3300);
    expect(m.tasaNetaEstimadaBps).toBe(3000);
    expect(m.brechaNetaBps).toBe(-1000);
    expect(m.capital).toBe("10000000.00");
    expect(m.cantidad).toBe(2);
  });

  it("solo cuentan los Funded", () => {
    const m = metricasCartera([ch("1000", 80, 5000), ch("9000", 10, 100, "Pending"), ch("9000", 10, 100, "Paid"), ch("9000", 10, 100, "Rejected")], POL)!;
    expect(m.cantidad).toBe(1);
    expect(m.puntajePromedioCentesimas).toBe(8000);
    expect(m.tasaBrutaBps).toBe(5000);
  });

  it("devuelve null sin activos vigentes", () => {
    expect(metricasCartera([], POL)).toBeNull();
    expect(metricasCartera([ch("1000", 80, 5000, "Paid")], POL)).toBeNull();
    expect(metricasCartera([ch("0", 80, 5000)], POL)).toBeNull();
  });

  it("redondea half-up y no pierde precisión con montos grandes (bigint)", () => {
    const m = metricasCartera([ch("1", 86, 4000), ch("1", 87, 4001)], POL)!;
    expect(m.puntajePromedioCentesimas).toBe(8650);
    expect(m.tasaBrutaBps).toBe(4001); // 4000,5 → 4001
    const g = metricasCartera([ch("99999999999999999.99", 90, 4300)], POL)!;
    expect(g.capital).toBe("99999999999999999.99");
    expect(g.tasaNetaEstimadaBps).toBe(4000);
  });

  it("la comisión sale de la política que se pasa, no de una constante", () => {
    expect(metricasCartera([ch("100", 90, 4300)], { objetivoTnaBps: 4000, comisionAnualBps: 500 })!.tasaNetaEstimadaBps).toBe(3800);
  });
});

describe("objetivo y puntaje de equilibrio", () => {
  it("el objetivo bruto coincide con el de la pantalla de políticas (neto + comisión)", () => {
    expect(objetivoBrutoBps(POLITICA_POR_DEFECTO)).toBe(objetivo.brutoBps);
    expect(objetivo.brutoBps).toBe(4300);
  });
  it("el puntaje de equilibrio sale de la función de tasa real", () => {
    const p = puntajeDeEquilibrio(4300)!;
    expect(tasaPorPuntaje(p).tasaBps).toBeGreaterThanOrEqual(4300);
    expect(tasaPorPuntaje(p + 1).tasaBps).toBeLessThan(4300);
    expect(p).toBe(100 - Math.ceil((4300 - CONFIG_FONDO.tamarTnaBps) / 120));
  });
  it("sin puntaje que llegue, null", () => {
    expect(puntajeDeEquilibrio(6001)).toBeNull();
  });
});

describe("textos", () => {
  const f = fondoJson as unknown as ResumenFondo;
  const T = textosRentabilidad(f.politica, formatBps);
  const todo = Object.values(T).join(" ");
  it("dicen objetivo no garantizado y usan la política", () => {
    expect(T.netaAviso).toContain("no garantizado");
    expect(T.netaNota).toContain(formatBps(f.politica.comisionAnualBps));
    expect(T.netaNota).toContain(formatBps(f.politica.objetivoTnaBps));
  });
  it("no usan palabras prohibidas", () => {
    expect(todo).not.toMatch(/\b(IA|AI)\b|rinde|rendimiento/i);
    expect(todo.replace("no garantizado", "")).not.toMatch(/garantiz/i);
  });
});

describe("formatPuntajeCentesimas", () => {
  it("formatea con coma", () => {
    expect(formatPuntajeCentesimas(8735)).toBe("87,35");
    expect(formatPuntajeCentesimas(8700)).toBe("87,00");
    expect(formatPuntajeCentesimas(7005)).toBe("70,05");
  });
});
