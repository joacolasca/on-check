import { describe, expect, it } from "vitest";
import type { ChequeVista } from "@/shared/types";
import { anchoBarra, contarPorFiltro, filtrarCheques, notaTir, proporcionBps } from "./panel";

const c = (estado: ChequeVista["estado"]): ChequeVista => ({
  id: estado, libradorHashCorto: "0x0…0", nominal: "1", precioCompra: "1", vencimiento: "2027-01-05",
  puntaje: 80, banda: "A", tasaTnaBps: 2600, estado, explicacion: "", txs: [],
  tipo: "cheque", industria: "Sin clasificar", emisorNombre: null, garantia: null,
});

describe("proporcionBps", () => {
  it("calcula la proporción sin number", () => {
    expect(proporcionBps("18500000", "30000000")).toBe(6166);
    expect(proporcionBps("11500000", "30000000")).toBe(3833);
    expect(proporcionBps("30000000", "30000000")).toBe(10000);
  });
  it("total cero da cero y nunca pasa de 100 %", () => {
    expect(proporcionBps("5", "0")).toBe(0);
    expect(proporcionBps("50", "10")).toBe(10000);
  });
  it("acepta decimales", () => {
    expect(proporcionBps("0.5", "1.0")).toBe(5000);
  });
});

describe("filtros", () => {
  const lista = [c("Funded"), c("Paid"), c("Funded"), c("Rejected")];
  it("filtra por estado y 'todos' devuelve todo", () => {
    expect(filtrarCheques(lista, "Funded")).toHaveLength(2);
    expect(filtrarCheques(lista, "todos")).toHaveLength(4);
    expect(filtrarCheques(lista, "Pending")).toHaveLength(0);
  });
  it("cuenta por filtro", () => {
    expect(contarPorFiltro(lista)).toEqual({ todos: 4, Pending: 0, Funded: 2, Paid: 1, Rejected: 1 });
  });
});

describe("anchoBarra", () => {
  it("convierte bps a % acotado", () => {
    expect(anchoBarra(3200)).toBe(32);
    expect(anchoBarra(12000)).toBe(100);
    expect(anchoBarra(-5)).toBe(0);
  });
});

describe("notaTir", () => {
  it("explica la TIR según el caso", () => {
    expect(notaTir(null)).toMatch(/Todavía no hay cheques cerrados/);
    expect(notaTir(2663)).toMatch(/Anualizada/);
    expect(notaTir(-45458)).toMatch(/Negativa: hubo pérdidas/);
    expect(notaTir(-45458)).not.toMatch(/rinde|rendimiento/i);
  });
});
