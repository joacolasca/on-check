import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import demo from "@fixtures/cheques-demo.json";
import industrias from "../../../shared/industrias.json";
import type { GarantiaInput } from "@/shared/types";
import { analizarGarantiaBase } from "@/lib/garantias";
import { analizarBalance } from "./balance";
import type { ClienteMensajes } from "./analista-llm";
import { crearEnriquecedorLlm, extraerJson, modeloConBusquedaWeb } from "./enriquecedor";
import { herramientasPorDefecto } from "./herramientas";
import { clasificarIndustria, clasificarIndustriaDeterminista } from "./industria";
import type { ContextoIndustria } from "./types";

afterEach(() => vi.unstubAllEnvs());

const sinBalance = analizarBalance(undefined);
const ctx = (cuit: string, denominacion: string | null): ContextoIndustria => ({ cuit, denominacion, balance: sinBalance });

function clienteQueResponde(texto: string | (() => never)) {
  const llamadas: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const create = vi.fn(async (p: Anthropic.MessageCreateParamsNonStreaming) => {
    llamadas.push(structuredClone(p));
    if (typeof texto === "function") texto();
    return { content: [{ type: "text", text: texto }], stop_reason: "end_turn" } as unknown as Anthropic.Message;
  });
  return { cliente: { messages: { create } } as ClienteMensajes, llamadas };
}

describe("industria · sin modelo (mapa determinístico de la demo)", () => {
  it("clasifica a los emisores de la demo con fundamento, fuentes y confianza", () => {
    const esperados: Record<string, number> = { "30703088534": 2, "30548083156": 1, "30590360763": 1, "30639453738": 3, "30526552659": 4, "30500530851": 7 };
    for (const [cuit, id] of Object.entries(esperados)) {
      const r = clasificarIndustriaDeterminista(ctx(cuit, null));
      expect(r.id).toBe(id);
      expect(r.nombre).toBe(industrias.find((i) => i.id === id)?.nombre);
      expect(r.fundamento.length).toBeGreaterThan(10);
      expect(r.fuentes).toContain("BCRA");
      expect(r.confianza).toBe("media");
    }
    for (const c of demo.cheques) expect(clasificarIndustriaDeterminista(ctx(c.librador_cuit, c.librador_nombre)).id).not.toBe(0);
  });

  it("usa la denominación del BCRA si el CUIT no está en el mapa", () => {
    expect(clasificarIndustriaDeterminista(ctx("20111111112", "TELECOM ARGENTINA SOCIEDAD ANONIMA")).id).toBe(3);
  });

  it("si no la conoce: id 0 'Sin clasificar', confianza baja y lo explica", () => {
    const r = clasificarIndustriaDeterminista(ctx("20111111112", "PANADERIA DON JOSE SRL"));
    expect(r).toMatchObject({ id: 0, nombre: "Sin clasificar", confianza: "baja" });
    expect(r.fundamento).toMatch(/no está en el mapa de la demo/);
    expect(clasificarIndustriaDeterminista(ctx("20111111112", null)).fundamento).toMatch(/no informa denominación/);
  });

  it("todos los ids devueltos existen en shared/industrias.json", () => {
    const ids = new Set(industrias.map((i) => i.id));
    for (const cuit of ["30703088534", "30500530851", "20111111112"]) expect(ids.has(clasificarIndustriaDeterminista(ctx(cuit, null)).id)).toBe(true);
  });
});

describe("industria · con modelo", () => {
  const respuesta = JSON.stringify({ id: 6, fundamento: "Exporta granos según el balance.", fuentes: ["balance cargado", "criterio del agente", "fuente inventada"], confianza: "alta" });

  it("devuelve la estimación del modelo, validada (id existente, fuentes permitidas)", async () => {
    const { cliente } = clienteQueResponde(`Acá va:\n\`\`\`json\n${respuesta}\n\`\`\``);
    const enr = crearEnriquecedorLlm({ cliente, modelo: "m", busquedaWeb: false });
    const r = await clasificarIndustria(ctx("20111111112", "AGRO SA"), enr);
    expect(r).toEqual({ id: 6, nombre: "Agro y alimentos", fundamento: "Exporta granos según el balance.", fuentes: ["balance cargado", "criterio del agente"], confianza: "alta" });
  });

  it("cae al mapa determinístico si el modelo falla, devuelve un id inexistente o usa frases prohibidas", async () => {
    const malas = [
      JSON.stringify({ id: 99, fundamento: "x", fuentes: [], confianza: "alta" }),
      JSON.stringify({ id: 6, fundamento: "El sector rinde mucho.", fuentes: [], confianza: "alta" }),
      JSON.stringify({ id: 6, fundamento: "Lo vio la IA.", fuentes: [], confianza: "alta" }),
      "no es json",
    ];
    for (const m of malas) {
      const { cliente } = clienteQueResponde(m);
      const r = await clasificarIndustria(ctx("30703088534", "MERCADOLIBRE S.R.L."), crearEnriquecedorLlm({ cliente, modelo: "m", busquedaWeb: false }));
      expect(r.id).toBe(2); // el del mapa
      expect(r.fuentes).toContain("mapa de emisores de la demo");
    }
    const roto = { messages: { create: async () => { throw new Error("timeout"); } } } as ClienteMensajes;
    const r = await clasificarIndustria(ctx("30703088534", null), crearEnriquecedorLlm({ cliente: roto, modelo: "m" }));
    expect(r.id).toBe(2);
  });

  it("id 0 siempre con confianza baja; no le manda al modelo el texto del balance, solo el resumen", async () => {
    const { cliente, llamadas } = clienteQueResponde(JSON.stringify({ id: 0, fundamento: "No alcanza la información.", fuentes: ["BCRA"], confianza: "alta" }));
    const balance = analizarBalance("Ventas: 1.000.000\nNota confidencial: cliente XYZ");
    const r = await crearEnriquecedorLlm({ cliente, modelo: "m", busquedaWeb: false }).clasificarIndustria({ cuit: "20111111112", denominacion: null, balance });
    expect(r?.confianza).toBe("baja");
    expect(String(llamadas[0].messages[0].content)).not.toMatch(/cliente XYZ/);
  });
});

describe("industria · búsqueda web (AGENT_WEB_RESEARCH=1 → sufijo :online)", () => {
  const ok = JSON.stringify({ id: 2, fundamento: "Comercio electrónico.", fuentes: ["búsqueda web", "BCRA"], confianza: "alta" });

  it("modeloConBusquedaWeb agrega el sufijo solo si está habilitada y no lo duplica", () => {
    expect(modeloConBusquedaWeb("anthropic/claude-haiku-5.5", true)).toBe("anthropic/claude-haiku-5.5:online");
    expect(modeloConBusquedaWeb("anthropic/claude-haiku-5.5:online", true)).toBe("anthropic/claude-haiku-5.5:online");
    expect(modeloConBusquedaWeb("anthropic/claude-haiku-5.5", false)).toBe("anthropic/claude-haiku-5.5");
  });

  it("con la variable definida, clasificar usa el modelo con ':online' (y acepta 'búsqueda web' como fuente)", async () => {
    vi.stubEnv("AGENT_WEB_RESEARCH", "1");
    const { cliente, llamadas } = clienteQueResponde(ok);
    const r = await crearEnriquecedorLlm({ cliente, modelo: "anthropic/claude-haiku-5.5" }).clasificarIndustria(ctx("30703088534", "MERCADOLIBRE S.R.L."));
    expect(llamadas[0].model).toBe("anthropic/claude-haiku-5.5:online");
    expect(r?.fuentes).toContain("búsqueda web");
  });

  it("sin la variable, no usa ':online' y descarta 'búsqueda web' como fuente", async () => {
    vi.stubEnv("AGENT_WEB_RESEARCH", "");
    const { cliente, llamadas } = clienteQueResponde(ok);
    const r = await crearEnriquecedorLlm({ cliente, modelo: "anthropic/claude-haiku-5.5" }).clasificarIndustria(ctx("30703088534", "MERCADOLIBRE S.R.L."));
    expect(llamadas[0].model).toBe("anthropic/claude-haiku-5.5");
    expect(r?.fuentes).toEqual(["BCRA"]);
  });

  it("la búsqueda web es solo para clasificar: el enriquecimiento de la garantía usa el modelo sin sufijo", async () => {
    vi.stubEnv("AGENT_WEB_RESEARCH", "1");
    const { cliente, llamadas } = clienteQueResponde(JSON.stringify({ riesgos: ["La descripción es escueta."], observaciones: "Pedir el dominio." }));
    const g: GarantiaInput = { tipo: "vehiculo", descripcion: "Camioneta", valorDeclarado: "10000000" };
    await crearEnriquecedorLlm({ cliente, modelo: "m" }).enriquecerGarantia(analizarGarantiaBase(g, "10000000"), g);
    expect(llamadas[0].model).toBe("m");
  });
});

describe("garantía · enriquecimiento del modelo (sin inventar)", () => {
  const g: GarantiaInput = { tipo: "vehiculo", descripcion: "Camioneta, sin más datos", valorDeclarado: "20000000" };

  it("las herramientas por defecto suman los riesgos del modelo y marcan 'agente'", async () => {
    const { cliente, llamadas } = clienteQueResponde(JSON.stringify({ riesgos: ["La descripción no dice año ni dominio."], observaciones: "Verificar el dominio antes de la prenda." }));
    const h = herramientasPorDefecto({ enriquecedor: crearEnriquecedorLlm({ cliente, modelo: "m" }) });
    const a = await h.analizar_garantia(g, "10000000");
    expect(a.analizadoPor).toBe("agente");
    expect(a.riesgos).toContain("La descripción no dice año ni dominio.");
    expect(a.coberturaBps).toBe(14_000);
    // el prompt le exige no inventar datos y le pasa solo lo que cargó el vendedor
    expect(String(llamadas[0].system)).toMatch(/No inventes datos/);
    expect(String(llamadas[0].messages[0].content)).toMatch(/Camioneta, sin más datos/);
  });

  it("sin modelo, o si el modelo falla o dice algo prohibido, queda el análisis base determinista", async () => {
    const base = analizarGarantiaBase(g, "10000000");
    expect(await herramientasPorDefecto().analizar_garantia(g, "10000000")).toEqual(base);
    const malas = [
      JSON.stringify({ riesgos: ["Rinde un 40 % garantizado."], observaciones: "El rendimiento garantizado es alto." }),
      "sin json",
    ];
    for (const m of malas) {
      const { cliente } = clienteQueResponde(m);
      const a = await herramientasPorDefecto({ enriquecedor: crearEnriquecedorLlm({ cliente, modelo: "m" }) }).analizar_garantia(g, "10000000");
      expect(a).toEqual(base);
      expect(a.analizadoPor).toBe("determinista");
    }
    const roto = { messages: { create: async () => { throw new Error("429"); } } } as ClienteMensajes;
    expect(await herramientasPorDefecto({ enriquecedor: crearEnriquecedorLlm({ cliente: roto, modelo: "m" }) }).analizar_garantia(g, "10000000")).toEqual(base);
  });
});

describe("extraerJson", () => {
  it("saca el objeto aunque venga rodeado de texto y devuelve null si no hay", () => {
    expect(extraerJson('Listo: {"a":1} fin')).toEqual({ a: 1 });
    expect(extraerJson("nada")).toBeNull();
    expect(extraerJson("{roto")).toBeNull();
  });
});
