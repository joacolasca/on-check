import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import { canonico } from "@/lib/scoring/cotizar";
import { TIPOS_GARANTIA, type GarantiaInput, type TipoGarantia } from "@/shared/types";
import { analizarGarantiaBase, DOCUMENTO_PRENDA, enriquecerGarantia } from "./index";

const garantia = (tipo: TipoGarantia, extra: Partial<GarantiaInput> = {}): GarantiaInput => ({ tipo, descripcion: "Activo de ejemplo", valorDeclarado: "10000000", ...extra });

describe("analizarGarantiaBase · descuentos por tipo (supuestos del fondo)", () => {
  const ESPERADOS: [TipoGarantia, number][] = [
    ["vehiculo", 3000], ["inmueble", 2500], ["terreno", 3500], ["embarcacion", 4000], ["energia", 4500],
    ["petroleo", 5500], ["fabrica", 4500], ["comercio", 5000], ["otra", 6000],
  ];
  it.each(ESPERADOS)("%s: descuento de %i bps y valor ajustado = declarado × (1 − descuento)", (tipo, haircut) => {
    const a = analizarGarantiaBase(garantia(tipo), "10000000");
    expect(a.haircutBps).toBe(haircut);
    expect(a.valorAjustado).toBe(String((10_000_000 * (10_000 - haircut)) / 10_000));
    expect(a.coberturaBps).toBe(10_000 - haircut); // valor 10 M sobre nominal 10 M
    expect(a.analizadoPor).toBe("determinista");
  });

  it("cubre todos los tipos de la spec", () => {
    expect(ESPERADOS.map(([t]) => t).sort()).toEqual(TIPOS_GARANTIA.filter((t) => t !== "ninguna").sort());
  });

  it("la cobertura es valorAjustado / nominal en bps (y puede superar el 100 %)", () => {
    const a = analizarGarantiaBase(garantia("vehiculo", { valorDeclarado: "20000000" }), "10000000");
    expect(a.valorAjustado).toBe("14000000");
    expect(a.coberturaBps).toBe(14_000);
    expect(analizarGarantiaBase(garantia("vehiculo", { valorDeclarado: "5000000" }), "10000000").coberturaBps).toBe(3500);
  });

  it("maneja decimales sin usar number para los montos", () => {
    const a = analizarGarantiaBase(garantia("inmueble", { valorDeclarado: "1234567.89" }), "1000000");
    expect(a.valorAjustado).toBe("925925.92");
    expect(typeof a.valorAjustado).toBe("string");
  });

  it("la liquidez depende del tipo", () => {
    expect(analizarGarantiaBase(garantia("vehiculo"), "1000000").liquidez).toBe("alta");
    expect(analizarGarantiaBase(garantia("inmueble"), "1000000").liquidez).toBe("media");
    expect(analizarGarantiaBase(garantia("petroleo"), "1000000").liquidez).toBe("baja");
  });
});

describe("analizarGarantiaBase · riesgos y documentos", () => {
  it("lista riesgos y documentos pendientes por tipo, y siempre la prenda legal como paso posterior", () => {
    const a = analizarGarantiaBase(garantia("vehiculo"), "10000000");
    expect(a.riesgos.length).toBeGreaterThan(0);
    expect(a.documentosPendientes.join(" ")).toMatch(/Título del automotor e informe de dominio/);
    expect(a.documentosPendientes.join(" ")).toMatch(/Tasación independiente/);
    expect(a.documentosPendientes.join(" ")).toMatch(/seguro/i);
    expect(a.documentosPendientes.join(" ")).toMatch(/libre de gravámenes/);
    expect(a.documentosPendientes.at(-1)).toBe(DOCUMENTO_PRENDA);
    expect(a.observaciones).toMatch(/la prenda o hipoteca legal es un paso posterior/);
    for (const t of TIPOS_GARANTIA.filter((x) => x !== "ninguna")) {
      expect(analizarGarantiaBase(garantia(t), "1000000").documentosPendientes.length).toBeGreaterThan(1);
    }
  });

  it("no pide de nuevo lo que el vendedor ya mencionó (sin verificarlo)", () => {
    const a = analizarGarantiaBase(garantia("vehiculo", { documentos: ["Tasación de la concesionaria", "Póliza de seguro todo riesgo"] }), "10000000");
    expect(a.documentosPendientes.join(" ")).not.toMatch(/Tasación independiente/);
    expect(a.documentosPendientes.join(" ")).not.toMatch(/Póliza de seguro/);
    expect(a.documentosPendientes.join(" ")).toMatch(/Título del automotor/);
    expect(a.observaciones).toMatch(/2 documentos, que todavía hay que revisar/);
  });

  it("la observación aclara que el valor es declarado y sin verificar, y no inventa datos del activo", () => {
    const a = analizarGarantiaBase(garantia("inmueble", { descripcion: "Departamento de dos ambientes" }), "10000000");
    expect(a.observaciones).toMatch(/declarado por el vendedor/);
    expect(a.observaciones).toMatch(/sin verificar/);
    expect(a.observaciones).not.toMatch(/Departamento de dos ambientes/); // no repite ni adorna la descripción
    expect(`${a.observaciones} ${a.riesgos.join(" ")}`).not.toMatch(/rinde|rendimiento garantizado|\b(?:IA|AI)\b/);
  });

  it("tipo 'ninguna': cobertura cero y sin documentos que reunir", () => {
    const a = analizarGarantiaBase(garantia("ninguna"), "10000000");
    expect(a).toMatchObject({ valorAjustado: "0", coberturaBps: 0, liquidez: "baja", documentosPendientes: [] });
  });
});

describe("garantiaHash", () => {
  it("es el keccak256 del JSON canónico del análisis sin su propio hash", () => {
    const a = analizarGarantiaBase(garantia("vehiculo"), "10000000");
    const { garantiaHash, ...sin } = a;
    expect(garantiaHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(garantiaHash).toBe(keccak256(toBytes(canonico(sin))));
  });

  it("es determinístico y cambia con cualquier dato", () => {
    const a = analizarGarantiaBase(garantia("vehiculo"), "10000000");
    expect(analizarGarantiaBase(garantia("vehiculo"), "10000000").garantiaHash).toBe(a.garantiaHash);
    expect(analizarGarantiaBase(garantia("vehiculo", { valorDeclarado: "10000001" }), "10000000").garantiaHash).not.toBe(a.garantiaHash);
    expect(analizarGarantiaBase(garantia("inmueble"), "10000000").garantiaHash).not.toBe(a.garantiaHash);
  });
});

describe("enriquecerGarantia", () => {
  it("suma riesgos y observaciones, marca 'agente', recalcula el hash y no toca los números", () => {
    const base = analizarGarantiaBase(garantia("vehiculo"), "10000000");
    const e = enriquecerGarantia(base, { riesgos: ["La descripción no indica el año", base.riesgos[0]], observaciones: "Conviene pedir el dominio." });
    expect(e.analizadoPor).toBe("agente");
    expect(e.riesgos).toContain("La descripción no indica el año");
    expect(e.riesgos.filter((r) => r === base.riesgos[0])).toHaveLength(1); // sin duplicados
    expect(e.observaciones.startsWith(base.observaciones)).toBe(true);
    expect(e.observaciones).toMatch(/Conviene pedir el dominio/);
    expect({ v: e.valorAjustado, c: e.coberturaBps, h: e.haircutBps }).toEqual({ v: base.valorAjustado, c: base.coberturaBps, h: base.haircutBps });
    expect(e.garantiaHash).not.toBe(base.garantiaHash);
    const { garantiaHash, ...sin } = e;
    expect(garantiaHash).toBe(keccak256(toBytes(canonico(sin))));
  });
});
