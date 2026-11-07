import { describe, expect, it } from "vitest";
import {
  cuitValido,
  etiquetaFuente,
  explicarErrorFondeo,
  hoyISO,
  normalizarCuit,
  normalizarMonto,
  pasoDeFase,
  validarFormulario,
} from "./pyme";

describe("normalizadores", () => {
  it("normalizarCuit deja solo dígitos", () => {
    expect(normalizarCuit("30-70308853-4")).toBe("30703088534");
    expect(normalizarCuit(" 30 70308853 4 ")).toBe("30703088534");
  });
  it("normalizarMonto acepta formato es-AR y saca ceros a la izquierda", () => {
    expect(normalizarMonto("$ 10.000.000")).toBe("10000000");
    expect(normalizarMonto("007")).toBe("7");
    expect(normalizarMonto("")).toBe("");
  });
});

describe("cuitValido", () => {
  it("acepta un CUIT con verificador correcto (CUIT público de una empresa grande)", () => {
    expect(cuitValido("30703088534")).toBe(true);
  });
  it("rechaza verificador incorrecto o largo equivocado", () => {
    expect(cuitValido("30703088535")).toBe(false);
    expect(cuitValido("3070308853")).toBe(false);
    expect(cuitValido("")).toBe(false);
  });
});

describe("validarFormulario", () => {
  const hoy = "2026-11-02";
  it("sin errores con datos válidos", () => {
    expect(validarFormulario({ cuit: "30-70308853-4", monto: "10.000.000", vencimiento: "2027-01-05" }, hoy)).toEqual({});
  });
  it("marca cada campo faltante", () => {
    const e = validarFormulario({ cuit: "", monto: "", vencimiento: "" }, hoy);
    expect(Object.keys(e).sort()).toEqual(["cuit", "monto", "vencimiento"]);
  });
  it("rechaza vencimientos de hoy o del pasado", () => {
    expect(validarFormulario({ cuit: "30703088534", monto: "1", vencimiento: hoy }, hoy).vencimiento).toBeDefined();
    expect(validarFormulario({ cuit: "30703088534", monto: "1", vencimiento: "2026-10-01" }, hoy).vencimiento).toBeDefined();
  });
  it("rechaza monto cero", () => {
    expect(validarFormulario({ cuit: "30703088534", monto: "0", vencimiento: "2027-01-05" }, hoy).monto).toBeDefined();
  });
});

describe("hoyISO", () => {
  it("formatea AAAA-MM-DD con ceros", () => {
    expect(hoyISO(new Date(2026, 10, 2))).toBe("2026-11-02");
  });
});

describe("mensajes", () => {
  it("explica la concentración sin culpar a nadie y sin decir que ARGt rinde", () => {
    const x = explicarErrorFondeo("CONCENTRACION_EXCEDIDA", "x");
    expect(x.detalle).toMatch(/10 %/);
    expect(x.detalle).not.toMatch(/rinde|rendimiento/i);
  });
  it("para códigos desconocidos usa el mensaje del servidor", () => {
    expect(explicarErrorFondeo("OTRO", "Mensaje").detalle).toBe("Mensaje");
  });
  it("etiqueta la fuente del BCRA", () => {
    expect(etiquetaFuente("bcra-live")).toMatch(/en vivo/);
    expect(etiquetaFuente("bcra-cache")).toMatch(/guardada/);
  });
});

describe("pasoDeFase", () => {
  it("mapea cada fase al paso del asistente", () => {
    expect(pasoDeFase("form")).toBe(1);
    expect(pasoDeFase("cotizando")).toBe(2);
    expect(pasoDeFase("cotizado")).toBe(2);
    for (const t of ["registrando", "fondeando", "listo", "fallo"]) expect(pasoDeFase(t)).toBe(3);
  });
});
