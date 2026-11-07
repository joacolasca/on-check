import { describe, expect, it } from "vitest";
import type { InputCotizacion } from "@/shared/types";
import { calcularPuntaje } from "@/lib/scoring/puntaje";
import { cotizar } from "@/lib/scoring/cotizar";
import { CONFIG_FONDO } from "@/lib/scoring/config";
import type { DatosBcra } from "@/lib/scoring/bcra-tipos";
import { analizarCheque } from "./index";
import { herramientasPorDefecto } from "./herramientas";
import { HERRAMIENTAS_LLM, PROMPT_SISTEMA } from "./analista-llm";
import { REGLAS_DE_COTIZACION } from "./politica";
import type { Analista, Herramientas } from "./types";

const input: InputCotizacion = { cuit: "30703088534", nominal: "10000000", vencimiento: "2027-01-05", pyme: "0x0000000000000000000000000000000000000001" };
const datos = (c: Partial<DatosBcra> = {}): DatosBcra => ({
  cuit: "30703088534", denominacion: "EMPRESA S.A.", entidadesActuales: [{ entidad: "BANCO X", situacion: 1, monto: 100, refinanciaciones: false }],
  deudaPorPeriodo: [], rechazados: [], fuente: "bcra-cache", consultadoEn: "2026-11-03T12:00:00.000Z", ...c,
});
const tramposo: Analista = {
  modo: "agente",
  async siguiente(e) {
    if (!e.scoring) return { tipo: "usar", herramienta: "consultar_bcra" };
    if (!e.cotizacion) return { tipo: "usar", herramienta: "emitir_cotizacion" };
    return { tipo: "concluir", decision: "aprobar", motivo: null, resumen: "Conviene comprarlo.", condiciones: [] };
  },
};
const correr = (d: DatosBcra, puntaje?: number) => {
  const scoring = { ...calcularPuntaje(d, new Date("2026-11-03T15:00:00Z")), ...(puntaje === undefined ? {} : { puntaje }) };
  const h: Herramientas = { ...herramientasPorDefecto(), consultar_bcra: async () => scoring, emitir_cotizacion: async (inp, sc) => cotizar(inp, sc, CONFIG_FONDO, new Date("2026-11-03T15:00:00Z")) };
  return analizarCheque({ ...input, vencimiento: "2027-01-05" }, { analista: tramposo, herramientas: h });
};

describe("agente · reglas de cotización (tasa por puntaje, mínimo 70, exclusión)", () => {
  it("el texto de reglas dice mínimo 70, piso, tope y exclusión, y lo ven el prompt y las herramientas", () => {
    expect(REGLAS_DE_COTIZACION).toMatch(/puntaje mínimo 70/);
    expect(REGLAS_DE_COTIZACION).toMatch(/1,2 pp por cada punto.*piso de 30 %.*tope de 60 %/);
    expect(REGLAS_DE_COTIZACION).toMatch(/rechazados impagos confirmados.*cualquier antigüedad/);
    expect(PROMPT_SISTEMA).toContain(REGLAS_DE_COTIZACION);
    expect(HERRAMIENTAS_LLM.find((h) => h.name === "ver_politica_del_fondo")?.description).toContain(REGLAS_DE_COTIZACION);
    expect(REGLAS_DE_COTIZACION).not.toMatch(/rinde|rendimiento garantizado|\bIA\b/i);
  });
  it("el paso de política del determinista menciona las reglas", async () => {
    const r = await analizarCheque(input);
    expect(r.pasos.map((p) => p.detalle).join(" ")).toContain(REGLAS_DE_COTIZACION);
  });
  it("puntaje 69: rechazado aunque el analista quiera aprobar", async () => {
    const r = await correr(datos(), 69);
    expect(r.cotizacion.aprobada).toBe(false);
    expect(r.cotizacion.decisionPM?.decision).toBe("rechazar");
  });
  it("puntaje 70: aprobado al tope de 60 %", async () => {
    const r = await correr(datos(), 70);
    expect(r.cotizacion.aprobada).toBe(true);
    expect(r.cotizacion.tasaTnaBps).toBe(6000);
  });
  it("impago confirmado viejo con puntaje 100: rechazado y el agente no lo revierte", async () => {
    const r = await correr(datos({ rechazados: [{ fechaRechazo: "2021-03-05", causal: "SIN FONDOS", impago: true }] }));
    expect(r.cotizacion.aprobada).toBe(false);
    expect(r.cotizacion.tasaTnaBps).toBe(0);
    expect(r.cotizacion.motivoRechazo).toMatch(/sin pagar informado.*impagos/);
    expect(r.pasos.at(-1)?.titulo).toMatch(/no comprar/i);
  });
  it("datos de cheques rechazados sin verificar: no se aprueba", async () => {
    const r = await correr(datos({ rechazadosVerificados: false }));
    expect(r.cotizacion.aprobada).toBe(false);
    expect(r.cotizacion.motivoRechazo).toMatch(/verificar/);
  });
});
