// Tests de la lógica de presentación nueva de la v2 (formato, pyme, invertir, demo, títulos del agente).
import { describe, expect, it } from "vitest";
import { TIPOS_GARANTIA } from "@/shared/types";
import { TITULO_HERRAMIENTA, tituloHerramienta } from "./agente-titulos";
import { NOMBRE_GARANTIA, ROTULO_MAV } from "./cotizacion";
import { leerResultadoRescates } from "./demo";
import { compararDecimales, dividirDecimales, escalarDecimal, formatPermil } from "./format";
import { cuotapartesPorMonto } from "./invertir";
import {
  LIMITE_BALANCE_BYTES,
  MAX_DOCUMENTOS,
  armarEntrada,
  explicarErrorFondeo,
  normalizarDocumentos,
  validarArchivoBalance,
  validarBalance,
  validarFormulario,
} from "./pyme";

describe("format v2", () => {
  it("divide decimales sin number y trunca", () => {
    expect(dividirDecimales("20000000", "1000")).toBe("20000");
    expect(dividirDecimales("20000000", "1004.82")).toBe("19904.062419");
    expect(dividirDecimales("1", "3", 3)).toBe("0.333");
    expect(() => dividirDecimales("1", "0")).toThrow();
  });
  it("compara y escala decimales", () => {
    expect(compararDecimales("10", "9.99")).toBe(1);
    expect(compararDecimales("1.50", "1.5")).toBe(0);
    expect(compararDecimales("2", "10")).toBe(-1);
    expect(escalarDecimal("1.5", 2)).toBe(150n);
  });
  it("formatea permilles como porcentaje es-AR", () => {
    expect(formatPermil(123)).toBe("12,3 %");
    expect(formatPermil(1000)).toBe("100 %");
    expect(formatPermil(5)).toBe("0,5 %");
    expect(formatPermil(0)).toBe("0 %");
  });
});

describe("invertir v2", () => {
  it("con $ 20.000.000 a $ 1.000 recibís 20.000 cuotapartes", () => {
    expect(cuotapartesPorMonto("20000000", "1000")).toBe("20000");
  });
  it("si el fondo todavía no informa valor, usa el inicial de $ 1.000", () => {
    expect(cuotapartesPorMonto("5000", "0")).toBe("5");
  });
});

describe("pyme v2", () => {
  const base = { cuit: "30-52655265-9", monto: "9.800.000", vencimiento: "2027-01-05" };
  const hoy = "2026-11-06";
  it("sin garantía ni balance no pide nada de más", () => {
    expect(validarFormulario({ ...base, tipo: "pagare" }, hoy)).toEqual({});
  });
  it("con garantía exige tipo, descripción y valor", () => {
    const e = validarFormulario({ ...base, garantia: { tipo: "ninguna", descripcion: " ", valorDeclarado: "", documentos: [] } }, hoy);
    expect(Object.keys(e).sort()).toEqual(["garantiaDescripcion", "garantiaTipo", "garantiaValor"]);
  });
  it("los mensajes hablan de librador o suscriptor según el tipo", () => {
    expect(validarFormulario({ cuit: "", monto: "", vencimiento: "", tipo: "cheque" }, hoy).cuit).toMatch(/librador/);
    expect(validarFormulario({ cuit: "", monto: "", vencimiento: "", tipo: "pagare" }, hoy).cuit).toMatch(/suscriptor/);
  });
  it("limita el tamaño del balance", () => {
    expect(validarBalance("a".repeat(LIMITE_BALANCE_BYTES))).toBeUndefined();
    expect(validarBalance("a".repeat(LIMITE_BALANCE_BYTES + 1))).toMatch(/máximo/);
    expect(validarBalance("ñ".repeat(LIMITE_BALANCE_BYTES / 2 + 1))).toMatch(/máximo/); // cuenta bytes, no letras
  });
  it("solo acepta archivos .txt o .csv dentro del límite", () => {
    expect(validarArchivoBalance("balance.csv", 1000)).toBeUndefined();
    expect(validarArchivoBalance("BALANCE.TXT", 1000)).toBeUndefined();
    expect(validarArchivoBalance("balance.pdf", 1000)).toMatch(/\.txt o \.csv/);
    expect(validarArchivoBalance("balance.txt", LIMITE_BALANCE_BYTES + 1)).toMatch(/máximo/);
  });
  it("limpia la lista de documentos", () => {
    expect(normalizarDocumentos([" Título ", "", "título", "Tasación"])).toEqual(["Título", "Tasación"]);
    expect(normalizarDocumentos(Array.from({ length: 30 }, (_, i) => `doc ${i}`))).toHaveLength(MAX_DOCUMENTOS);
  });
  it("arma el body del agente solo con lo completado", () => {
    expect(armarEntrada({ ...base, balance: "  " })).toEqual({ cuit: "30526552659", nominal: "9800000", vencimiento: "2027-01-05", tipo: "cheque" });
    const e = armarEntrada({ ...base, tipo: "pagare", balance: "Activo,100", garantia: { tipo: "energia", descripcion: " Turbina ", valorDeclarado: "12.000.000", documentos: ["Tasación", " "] } });
    expect(e.tipo).toBe("pagare");
    expect(e.balance).toBe("Activo,100");
    expect(e.garantia).toEqual({ tipo: "energia", descripcion: "Turbina", valorDeclarado: "12000000", documentos: ["Tasación"] });
  });
  it("explica las reglas nuevas del contrato", () => {
    expect(explicarErrorFondeo("CONCENTRACION_EXCEDIDA", "x").detalle).toMatch(/10 %/);
    expect(explicarErrorFondeo("INDUSTRIA_EXCEDIDA", "x").detalle).toMatch(/25 %/);
    expect(explicarErrorFondeo("LIQUIDEZ_MINIMA_INSUFICIENTE", "x").detalle).toMatch(/15 %/);
  });
});

describe("cotización y agente", () => {
  it("todas las garantías tienen nombre en castellano", () => {
    for (const t of TIPOS_GARANTIA) expect(NOMBRE_GARANTIA[t]).toBeTruthy();
  });
  it("el MAV siempre se rotula como simulado", () => {
    expect(ROTULO_MAV).toBe("MAV (simulado)");
  });
  it("las herramientas nuevas tienen título en castellano; las desconocidas caen al nombre", () => {
    for (const h of ["ver_politica_del_fondo", "consultar_mav", "analizar_balance", "clasificar_industria", "analizar_garantia"]) {
      expect(TITULO_HERRAMIENTA[h]).toBeTruthy();
      expect(tituloHerramienta(h)).not.toMatch(/_/);
    }
    expect(tituloHerramienta("otra_cosa")).toBe("otra_cosa");
  });
});

describe("leerResultadoRescates", () => {
  it("lee liquidados, salteados y la explicación del gestor", () => {
    const r = leerResultadoRescates({ liquidados: [{ id: 1, cuotapartes: "5000", monto: "5024100", tx: "0xabc" }], salteados: [{ id: "3", motivo: "falta plazo" }], explicacion: "La reserva queda en 36 %." });
    expect(r.liquidados[0]).toEqual({ id: "1", cuotapartes: "5000", monto: "5024100", tx: "0xabc", motivo: null });
    expect(r.salteados[0].motivo).toBe("falta plazo");
    expect(r.explicacion).toBe("La reserva queda en 36 %.");
  });
  it("tolera respuestas vacías o raras sin romper", () => {
    expect(leerResultadoRescates(null)).toEqual({ liquidados: [], salteados: [], explicacion: null });
    expect(leerResultadoRescates({ liquidados: "no" }).liquidados).toEqual([]);
  });
});
