import { describe, expect, it } from "vitest";
import { analizarCheque } from "./agent";
import { armarInforme, type InformeActivo } from "./agent/informe";
import { guardarInformeLocal, leerInformeLocal, type AlmacenLocal } from "./informe-local";
import { NOTA_SIN_INFORME, etiquetaCumple, puntosConSigno, rutaDetalle, separarReglas, tasaYPlazo } from "./detalle-vista";

const falso = (): AlmacenLocal & { datos: Map<string, string> } => {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v) };
};
const roto: AlmacenLocal = {
  getItem: () => {
    throw new Error("bloqueado");
  },
  setItem: () => {
    throw new Error("lleno");
  },
};
async function informe(): Promise<InformeActivo> {
  const r = await analizarCheque({ cuit: "30703088534", nominal: "10000000", vencimiento: "2027-01-05", pyme: "0x1" });
  return armarInforme(r, { generadoEn: "2026-11-07T12:00:00.000Z" });
}

describe("informe local (sessionStorage)", () => {
  it("guarda y lee el informe del mismo activo con el mismo hash (sin distinguir mayúsculas)", async () => {
    const i = await informe();
    const a = falso();
    expect(guardarInformeLocal(i, a)).toBe(true);
    expect(leerInformeLocal(i.cotizacion.id.toUpperCase().replace("0X", "0x"), i.cotizacion.cotizacionHash.toUpperCase().replace("0X", "0x"), a)).toEqual(i);
  });

  it("si el hash on-chain no coincide, no lo usa", async () => {
    const i = await informe();
    const a = falso();
    guardarInformeLocal(i, a);
    expect(leerInformeLocal(i.cotizacion.id, "0x" + "00".repeat(32), a)).toBeNull();
  });

  it("sin hash on-chain para comparar, no lo usa", async () => {
    const i = await informe();
    const a = falso();
    guardarInformeLocal(i, a);
    expect(leerInformeLocal(i.cotizacion.id, null, a)).toBeNull();
  });

  it("si está guardado bajo un id pero el contenido es de otro activo, no lo usa", async () => {
    const i = await informe();
    const a = falso();
    const otro = "0x" + "77".repeat(32);
    a.datos.set(`fc_informe:${otro}`, JSON.stringify(i));
    expect(leerInformeLocal(otro, i.cotizacion.cotizacionHash, a)).toBeNull();
  });

  it("datos corruptos o con otra forma → null", async () => {
    const i = await informe();
    const a = falso();
    a.datos.set(`fc_informe:${i.cotizacion.id.toLowerCase()}`, "{no es json");
    expect(leerInformeLocal(i.cotizacion.id, i.cotizacion.cotizacionHash, a)).toBeNull();
    a.datos.set(`fc_informe:${i.cotizacion.id.toLowerCase()}`, JSON.stringify({ version: 1 }));
    expect(leerInformeLocal(i.cotizacion.id, i.cotizacion.cotizacionHash, a)).toBeNull();
  });

  it("un almacenamiento que tira errores o no existe no rompe nada", async () => {
    const i = await informe();
    expect(guardarInformeLocal(i, roto)).toBe(false);
    expect(leerInformeLocal(i.cotizacion.id, i.cotizacion.cotizacionHash, roto)).toBeNull();
    expect(guardarInformeLocal(i, null)).toBe(false);
    expect(leerInformeLocal(i.cotizacion.id, i.cotizacion.cotizacionHash, null)).toBeNull();
  });
});

describe("textos del detalle", () => {
  it("etiquetas de reglas", () => {
    expect([true, false, null].map(etiquetaCumple)).toEqual(["Cumple", "No cumple", "Sin evaluar"]);
  });
  it("ajustes, tasa y ruta", () => {
    expect([puntosConSigno(-15), puntosConSigno(5), puntosConSigno(0)]).toEqual(["−15", "+5", "0"]);
    expect(tasaYPlazo(3500, 60)).toBe("35 % anual · 60 días");
    expect(rutaDetalle("0xabc")).toBe("/cheques/0xabc");
  });
  it("la nota sin informe avisa que se muestra lo on-chain, sin palabras prohibidas ni IA", () => {
    expect(NOTA_SIN_INFORME).toMatch(/on-chain/);
    expect(NOTA_SIN_INFORME).not.toMatch(/rinde|rendimiento garantizado|\bIA\b/i);
  });
  it("separa las reglas del sistema de las del contrato", async () => {
    const { sistema, contrato } = separarReglas((await informe()).reglas);
    expect(sistema.map((r) => r.id)).toEqual(["puntaje", "impagos", "antecedentes", "plazo", "monto"]);
    expect(contrato.map((r) => r.id)).toEqual(["concentracion", "industria", "liquidez"]);
  });
});
