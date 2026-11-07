import { describe, expect, it } from "vitest";
import type { InputCotizacion } from "@/shared/types";
import { CONFIG_FONDO } from "@/lib/scoring/config";
import { calcularPuntaje } from "@/lib/scoring/puntaje";
import { cotizar } from "@/lib/scoring/cotizar";
import { analizarCheque } from "./index";
import { herramientasPorDefecto } from "./herramientas";
import { armarInforme, enmascararCuit, esInformeCheque, rentabilidadEsperada, type InformeActivo } from "./informe";
import type { Accion, Analista, EstadoAgente, Herramientas } from "./types";

const input: InputCotizacion = { cuit: "30703088534", nominal: "10000000", vencimiento: "2027-01-05", pyme: "0x0000000000000000000000000000000000000001" };
const EXTRA = { generadoEn: "2026-11-07T12:00:00.000Z" };
const conHerramientas = (cambios: Partial<Herramientas>): Herramientas => ({ ...herramientasPorDefecto(), ...cambios });
const regla = (i: InformeActivo, id: string) => i.reglas.find((r) => r.id === id);
const cumple = (i: InformeActivo, id: string) => regla(i, id)?.cumple;

const datos = (extra: object) => ({
  cuit: "30703088534", denominacion: "EMPRESA S.A.", entidadesActuales: [{ entidad: "BANCO X", situacion: 1, monto: 100, refinanciaciones: false }],
  deudaPorPeriodo: [], rechazados: [], fuente: "bcra-cache" as const, consultadoEn: "2026-11-03T12:00:00.000Z", ...extra,
});
const analizarCon = (d: object, inp: InputCotizacion = input) => {
  const scoring = calcularPuntaje(datos(d));
  return analizarCheque(inp, { herramientas: conHerramientas({ consultar_bcra: async () => scoring, emitir_cotizacion: async (i, s, x) => cotizar(i, s, CONFIG_FONDO, undefined, undefined, x) }) });
};
const textos = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(textos) : v && typeof v === "object" ? Object.values(v).flatMap(textos) : []);

describe("armarInforme", () => {
  it("cheque aprobado: reglas del sistema que cumplen, reglas del contrato marcadas y decisión del backend", async () => {
    const r = await analizarCheque(input);
    const i = armarInforme(r, EXTRA);
    expect(i.version).toBe(2);
    expect(i.decision).toEqual({ aprobada: true, motivo: null });
    expect(i.reglas.map((x) => x.id)).toEqual(["puntaje", "impagos", "antecedentes", "plazo", "monto", "concentracion", "industria", "liquidez"]);
    expect(i.reglas.filter((x) => x.verifica === "sistema").every((x) => x.cumple === true)).toBe(true);
    for (const id of ["concentracion", "industria", "liquidez"]) {
      expect(regla(i, id)?.verifica).toBe("contrato");
      expect(regla(i, id)?.detalle).toMatch(/Lo verifica el contrato al comprar/);
    }
    expect(i.cotizacion).toEqual({ id: r.cotizacion.id, cotizacionHash: r.cotizacion.cotizacionHash });
    expect(i.activo.tipo).toBe("cheque");
    expect(i.activo.rentabilidadEsperada?.etiqueta).toBe("Rentabilidad esperada (estimada, no garantizada)");
    expect(i.garantia).toBeNull();
    expect(i.industria).not.toBeNull();
    expect(i.agente.modo).toBe("determinista");
    expect(i.agente.pasos.length).toBeGreaterThan(4);
    expect(esInformeCheque(JSON.parse(JSON.stringify(i)))).toBe(true);
  });

  it("las reglas del contrato quedan en null si el agente no calculó la proyección", async () => {
    const r = await analizarCheque(input);
    const { proyecciones: _p, ...sinProy } = r;
    void _p;
    const i = armarInforme(sinProy, EXTRA);
    for (const id of ["concentracion", "industria", "liquidez"]) expect(cumple(i, id)).toBeNull();
  });

  it("pagaré con garantía: incluye el análisis de la garantía y habla de suscriptor", async () => {
    const r = await analizarCheque({ ...input, tipo: "pagare", garantia: { tipo: "vehiculo", descripcion: "Camioneta usada", valorDeclarado: "20000000", documentos: ["Tasación"] } });
    const i = armarInforme(r, EXTRA);
    expect(i.activo.tipo).toBe("pagare");
    expect(i.garantia?.tipo).toBe("vehiculo");
    expect(i.garantia?.coberturaBps).toBeGreaterThan(0);
    expect(i.garantia?.documentosPendientes.length).toBeGreaterThan(0);
    expect(regla(i, "puntaje")?.regla).toMatch(/suscriptor/);
    expect(i.activo.rentabilidadEsperada?.nota).toMatch(/pagaré/);
  });

  it("rechazado por puntaje: la regla no cumple, el contrato no se evalúa y no hay rentabilidad", async () => {
    const r = await analizarCon({ entidadesActuales: [{ entidad: "BANCO X", situacion: 3, monto: 100, refinanciaciones: true }] });
    const i = armarInforme(r, EXTRA);
    expect(r.cotizacion.aprobada).toBe(false);
    expect(i.decision).toEqual({ aprobada: false, motivo: r.cotizacion.motivoRechazo });
    expect(cumple(i, "puntaje")).toBe(false);
    expect(cumple(i, "concentracion")).toBeNull();
    expect(i.activo.rentabilidadEsperada).toBeNull();
  });

  it("rechazado por impago confirmado: la regla de impagos no cumple y hay alerta", async () => {
    const r = await analizarCon({ rechazados: [{ fechaRechazo: "2021-03-05", causal: "SIN FONDOS", impago: true }] });
    const i = armarInforme(r, EXTRA);
    expect(i.decision.aprobada).toBe(false);
    expect(cumple(i, "impagos")).toBe(false);
    expect(cumple(i, "antecedentes")).toBe(true);
    expect(i.alertas.some((a) => /sin pagar informado/.test(a))).toBe(true);
  });

  it("datos sin verificar: impagos sin evaluar y antecedentes no cumple", async () => {
    const r = await analizarCon({ rechazadosVerificados: false });
    const i = armarInforme(r, EXTRA);
    expect(i.decision.aprobada).toBe(false);
    expect(cumple(i, "impagos")).toBeNull();
    expect(cumple(i, "antecedentes")).toBe(false);
  });

  it("enmascara el CUIT aunque el agente lo repita en sus textos, y limpia palabras prohibidas", async () => {
    const analista: Analista = {
      modo: "agente",
      async siguiente(e: EstadoAgente): Promise<Accion> {
        if (!e.scoring) return { tipo: "usar", herramienta: "consultar_bcra" };
        if (!e.cotizacion) return { tipo: "usar", herramienta: "emitir_cotizacion" };
        if (e.pasos.at(-1)?.tipo !== "pensamiento") return { tipo: "pensar", titulo: "Reviso 30-70308853-4", detalle: "El CUIT 30703088534 rinde bien, rendimiento garantizado." };
        return { tipo: "concluir", decision: "aprobar", condiciones: [], motivo: null, resumen: "Emisor 30-70308853-4 sin problemas." };
      },
    };
    const r = await analizarCheque(input, { analista });
    const i = armarInforme(r, EXTRA);
    const todo = textos(i).join("\n");
    expect(todo).not.toMatch(/30-?70308853-?4/);
    expect(todo).toContain("**-******53-4");
    expect(todo).not.toMatch(/rinde|rendimiento garantizado/i);
    expect(i.agente.modo).toBe("agente");
  });

  it("ningún texto del informe tiene palabras prohibidas ni la sigla IA", async () => {
    const i = armarInforme(await analizarCheque({ ...input, tipo: "pagare", garantia: { tipo: "vehiculo", descripcion: "Camioneta", valorDeclarado: "20000000", documentos: [] } }), EXTRA);
    const todo = textos(i).join("\n");
    expect(todo).not.toMatch(/rinde|rendimiento garantizado/i);
    expect(todo).not.toMatch(/\bIA\b/);
  });
});

describe("funciones sueltas", () => {
  it("enmascararCuit deja solo los últimos 3 dígitos", () => {
    expect(enmascararCuit("30-70308853-4")).toBe("**-******53-4");
    expect(enmascararCuit("123")).toBe("123");
  });
  it("rentabilidadEsperada con bigint", () => {
    expect(rentabilidadEsperada("100", "900", 90)).toEqual({ periodoBps: 1111, anualizadaBps: 4506 });
    expect(rentabilidadEsperada("100", "900", 0)).toBeNull();
    expect(rentabilidadEsperada("100", "0", 30)).toBeNull();
  });
  it("esInformeCheque rechaza formas inválidas", () => {
    expect(esInformeCheque(null)).toBe(false);
    expect(esInformeCheque({ version: 1 })).toBe(false);
    expect(esInformeCheque({ version: 2, cotizacion: {} })).toBe(false);
  });
});
