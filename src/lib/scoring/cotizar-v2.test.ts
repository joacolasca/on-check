// Campos v2 de la cotización: tipo, industria, garantía, MAV y decisión del PM. El hash los cubre y sigue siendo determinístico.
import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import type { InputCotizacion } from "@/shared/types";
import { analizarGarantiaBase } from "@/lib/garantias";
import { consultarMavSimulado } from "@/lib/mav";
import { CONFIG_FONDO } from "./config";
import { canonico, cotizacionIntegra, cotizar, hashearCotizacion, INDUSTRIA_SIN_CLASIFICAR } from "./cotizar";
import { calcularPuntaje } from "./puntaje";
import type { DatosBcra } from "./bcra-tipos";

const HOY = new Date("2026-11-03T15:00:00Z");
const datos: DatosBcra = { cuit: "30703088534", denominacion: "MERCADOLIBRE S.R.L.", entidadesActuales: [], deudaPorPeriodo: [], rechazados: [], fuente: "bcra-cache", consultadoEn: "2026-11-03T12:00:00.000Z" };
const scoring = calcularPuntaje(datos, HOY);
const input: InputCotizacion = { cuit: "30703088534", nominal: "10000000", vencimiento: "2027-01-02", pyme: "0x0000000000000000000000000000000000000001" };
const salt = "sal-de-prueba";
const industria = { id: 2, nombre: "Tecnología y comercio electrónico", fundamento: "Plataforma de comercio electrónico.", fuentes: ["BCRA"], confianza: "media" as const };

describe("cotizar · campos v2", () => {
  it("sin extras: tipo 'cheque', industria 'Sin clasificar' y sin garantía, MAV ni decisión (las claves ni existen)", () => {
    const c = cotizar(input, scoring, CONFIG_FONDO, HOY, salt);
    expect(c.tipo).toBe("cheque");
    expect(c.industria).toEqual(INDUSTRIA_SIN_CLASIFICAR);
    for (const k of ["garantia", "mav", "decisionPM"]) expect(Object.keys(c)).not.toContain(k);
    expect(cotizacionIntegra(c)).toBe(true);
  });

  it("los números de la cotización no cambian por los campos nuevos", () => {
    const a = cotizar(input, scoring, CONFIG_FONDO, HOY, salt);
    const b = cotizar({ ...input, tipo: "pagare" }, scoring, CONFIG_FONDO, HOY, salt, { industria });
    expect([b.tasaTnaBps, b.descuento, b.precioCompra, b.dias]).toEqual([a.tasaTnaBps, a.descuento, a.precioCompra, a.dias]);
    expect(b.tipo).toBe("pagare");
  });

  it("el hash cubre tipo, industria, garantía, MAV y decisión del PM, y es determinístico", () => {
    const garantia = analizarGarantiaBase({ tipo: "vehiculo", descripcion: "Camioneta", valorDeclarado: "20000000" }, "10000000");
    const mav = consultarMavSimulado("30703088534");
    const extras = { industria, garantia, mav, decisionPM: { decision: "aprobar" as const, condiciones: [], resumen: "Bien." } };
    const completa = cotizar({ ...input, tipo: "pagare" }, scoring, CONFIG_FONDO, HOY, salt, extras);
    expect(cotizar({ ...input, tipo: "pagare" }, scoring, CONFIG_FONDO, HOY, salt, extras).cotizacionHash).toBe(completa.cotizacionHash);
    const { cotizacionHash, ...sin } = completa;
    expect(cotizacionHash).toBe(keccak256(toBytes(canonico(sin))));
    const hashes = new Set([
      completa.cotizacionHash,
      cotizar({ ...input, tipo: "pagare" }, scoring, CONFIG_FONDO, HOY, salt, { ...extras, industria: { ...industria, id: 3 } }).cotizacionHash,
      cotizar({ ...input, tipo: "pagare" }, scoring, CONFIG_FONDO, HOY, salt, { ...extras, decisionPM: { decision: "rechazar", condiciones: [], resumen: "Bien." } }).cotizacionHash,
      cotizar({ ...input, tipo: "pagare" }, scoring, CONFIG_FONDO, HOY, salt, { industria, garantia, mav }).cotizacionHash,
      cotizar({ ...input, tipo: "pagare" }, scoring, CONFIG_FONDO, HOY, salt, { industria, garantia }).cotizacionHash,
      cotizar(input, scoring, CONFIG_FONDO, HOY, salt, extras).cotizacionHash,
    ]);
    expect(hashes.size).toBe(6);
  });

  it("agregar la decisión del PM exige recalcular el hash", () => {
    const c = cotizar(input, scoring, CONFIG_FONDO, HOY, salt);
    const conDecision = { ...c, decisionPM: { decision: "aprobar" as const, condiciones: [], resumen: "Bien." } };
    expect(cotizacionIntegra(conDecision)).toBe(false);
    const { cotizacionHash: _h, ...sin } = conDecision;
    void _h;
    expect(cotizacionIntegra({ ...conDecision, cotizacionHash: hashearCotizacion(sin) })).toBe(true);
  });

  it("el balance del usuario no viaja dentro de la cotización (ni cambia el id)", () => {
    const a = cotizar(input, scoring, CONFIG_FONDO, HOY, salt);
    const b = cotizar({ ...input, balance: "Ventas: 1.000" }, scoring, CONFIG_FONDO, HOY, salt);
    expect(b.input.balance).toBeUndefined();
    expect(b.id).toBe(a.id);
    expect(b.cotizacionHash).toBe(a.cotizacionHash);
  });

  it("el id de un pagaré se distingue del de un cheque con los mismos datos; el del cheque no cambia", () => {
    const c = cotizar(input, scoring, CONFIG_FONDO, HOY, salt);
    expect(cotizar({ ...input, tipo: "cheque" }, scoring, CONFIG_FONDO, HOY, salt).id).toBe(c.id);
    expect(cotizar({ ...input, tipo: "pagare" }, scoring, CONFIG_FONDO, HOY, salt).id).not.toBe(c.id);
  });
});
