import { describe, expect, it } from "vitest";
import type { ChequeVista } from "@/shared/types";
import { chequesLiquidables, resumenPorEstado, textoResultado } from "./demo";

const c = (id: string, estado: ChequeVista["estado"]): ChequeVista => ({
  id, libradorHashCorto: "0x0…0", nominal: "1", precioCompra: "1", vencimiento: "2027-01-05",
  puntaje: 80, banda: "A", tasaTnaBps: 2600, estado, explicacion: "", txs: [],
  tipo: "cheque", industria: "Sin clasificar", emisorNombre: null, garantia: null,
});

describe("demo", () => {
  const lista = [c("a", "Funded"), c("b", "Paid"), c("c", "Funded"), c("d", "Pending"), c("e", "Rejected")];
  it("solo los Funded se pueden liquidar", () => {
    expect(chequesLiquidables(lista).map((x) => x.id)).toEqual(["a", "c"]);
  });
  it("cuenta por estado", () => {
    expect(resumenPorEstado(lista)).toEqual({ Pending: 1, Funded: 2, Paid: 1, Rejected: 1 });
  });
  it("describe cada resultado sin decir que ARGt rinde", () => {
    expect(textoResultado("pagado")).toMatch(/cobra/);
    expect(textoResultado("rechazado")).toMatch(/pérdida/);
    expect(textoResultado("pagado") + textoResultado("rechazado")).not.toMatch(/rinde|rendimiento/i);
  });
});
