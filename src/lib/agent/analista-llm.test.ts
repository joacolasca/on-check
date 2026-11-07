import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import cotizacionFija from "@fixtures/api/cotizacion.json";
import type { Cotizacion, InputCotizacion } from "@/shared/types";
import { analizarCheque } from "./index";
import { crearAnalistaLlm, crearClienteOpenRouter, HERRAMIENTAS_LLM, MODELO_OPENROUTER_POR_DEFECTO, MODELO_POR_DEFECTO, PROMPT_SISTEMA, type ClienteMensajes } from "./analista-llm";
import { hayClaveDeModelo, proveedorActivo, seleccionarAnalista, timeoutDelAnalista } from "./seleccion";

const FIJA = cotizacionFija as unknown as Cotizacion;
const input: InputCotizacion = { cuit: "30703088534", nominal: "10000000", vencimiento: "2027-01-05", pyme: "0x0000000000000000000000000000000000000001" };

type Bloque = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
const respuesta = (content: Bloque[], stop_reason = "tool_use") => ({ content, stop_reason }) as unknown as Anthropic.Message;
const uso = (id: string, name: string, texto?: string): Anthropic.Message =>
  respuesta([...(texto ? [{ type: "text" as const, text: texto }] : []), { type: "tool_use", id, name, input: {} }]);
const concluir = (decision: string, resumen: string, motivo = "", condiciones: string[] = []): Anthropic.Message =>
  respuesta([{ type: "tool_use", id: "tu_fin", name: "concluir", input: { decision, condiciones, motivo, resumen } }]);

function clienteSimulado(respuestas: Anthropic.Message[]) {
  const llamadas: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const create = vi.fn(async (p: Anthropic.MessageCreateParamsNonStreaming) => {
    llamadas.push(structuredClone(p));
    const r = respuestas.shift();
    if (!r) throw new Error("sin más respuestas simuladas");
    return r;
  });
  return { cliente: { messages: { create } } as ClienteMensajes, llamadas, create };
}

const HERRAMIENTAS_DEL_GUION = ["ver_politica_del_fondo", "consultar_bcra", "ver_cartera_actual", "consultar_mav", "analizar_balance", "clasificar_industria", "analizar_garantia", "emitir_cotizacion"];
const guion = () => [
  uso("tu_1", "ver_politica_del_fondo", "Empiezo por la política."),
  uso("tu_2", "consultar_bcra", "Ahora el BCRA."),
  uso("tu_3", "ver_cartera_actual"),
  uso("tu_4", "consultar_mav"),
  uso("tu_5", "analizar_balance"),
  uso("tu_6", "clasificar_industria"),
  uso("tu_7", "analizar_garantia"),
  uso("tu_8", "emitir_cotizacion", "Calculo la cotización."),
  concluir("aprobar", "Es un cheque de bajo riesgo. Conviene comprarlo."),
];

afterEach(() => vi.unstubAllEnvs());

describe("analista con Claude (cliente simulado)", () => {
  it("recorre las herramientas, muestra el razonamiento y concluye en modo agente", async () => {
    const { cliente } = clienteSimulado(guion());
    const r = await analizarCheque(input, { analista: crearAnalistaLlm({ cliente }) });
    expect(r.modo).toBe("agente");
    expect(r.pasos.filter((p) => p.tipo === "herramienta").map((p) => p.herramienta)).toEqual(HERRAMIENTAS_DEL_GUION);
    expect(r.pasos.filter((p) => p.tipo === "pensamiento").map((p) => p.detalle)).toContain("Ahora el BCRA.");
    expect(r.cotizacion.decisionPM).toEqual({ decision: "aprobar", condiciones: [], resumen: "Es un cheque de bajo riesgo. Conviene comprarlo." });
    expect(r.cotizacion.precioCompra).toBe(FIJA.precioCompra); // las cifras no son del modelo
  });

  it("pide la API con los parámetros correctos para Opus 5.5", async () => {
    const { cliente, llamadas } = clienteSimulado(guion());
    await analizarCheque(input, { analista: crearAnalistaLlm({ cliente }) });
    const p = llamadas[0];
    expect(p.model).toBe(MODELO_POR_DEFECTO);
    expect(p.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true }); // sin tool_choice forzado
    expect(p).not.toHaveProperty("temperature");
    expect(p).not.toHaveProperty("thinking"); // no se desactiva el razonamiento
    expect(p.system).toBe(PROMPT_SISTEMA);
    expect(p.tools?.map((t) => ("name" in t ? t.name : ""))).toEqual(HERRAMIENTAS_LLM.map((t) => t.name));
    expect(HERRAMIENTAS_LLM.map((t) => t.name)).toEqual([...HERRAMIENTAS_DEL_GUION, "concluir"]); // ninguna herramienta mueve fondos
  });

  it("el prompt del gestor lleva la política: MAV simulado, objetivo no promesa y prenda como paso posterior", () => {
    expect(PROMPT_SISTEMA).toMatch(/gestor/);
    expect(PROMPT_SISTEMA).toMatch(/MAV \(simulado\)/);
    expect(PROMPT_SISTEMA).toMatch(/objetivo de TNA es un objetivo, nunca una promesa/);
    expect(PROMPT_SISTEMA).toMatch(/prenda o hipoteca legal es un paso posterior/);
    expect(PROMPT_SISTEMA).toMatch(/no movés fondos/);
  });

  it("le cuenta al modelo si hay garantía y balance, sin pasarle el texto del balance", async () => {
    const { cliente, llamadas } = clienteSimulado(guion());
    await analizarCheque({ ...input, tipo: "pagare", balance: "Ventas: 1.000 SECRETO" }, { analista: crearAnalistaLlm({ cliente }) });
    const primero = String(llamadas[0].messages[0].content);
    expect(primero).toMatch(/Analizá este pagaré/);
    expect(primero).toMatch(/Garantía cargada: no\. Balance cargado: sí/);
    expect(primero).not.toMatch(/SECRETO/);
  });

  it("acepta aprobar con condiciones", async () => {
    const g = guion();
    g[8] = concluir("aprobar_con_condiciones", "Falta documentación.", "", ["Reunir el título de dominio"]);
    const { cliente } = clienteSimulado(g);
    const r = await analizarCheque(input, { analista: crearAnalistaLlm({ cliente }) });
    expect(r.cotizacion.decisionPM).toEqual({ decision: "aprobar_con_condiciones", condiciones: ["Reunir el título de dominio"], resumen: "Falta documentación." });
  });

  it("devuelve cada resultado de herramienta con el tool_use_id correcto", async () => {
    const { cliente, llamadas } = clienteSimulado(guion());
    await analizarCheque(input, { analista: crearAnalistaLlm({ cliente }) });
    const resultados = llamadas.slice(1).map((l) => {
      const ultimo = l.messages[l.messages.length - 1];
      const bloque = (ultimo.content as Anthropic.ToolResultBlockParam[])[0];
      return { id: bloque.tool_use_id, contenido: JSON.parse(bloque.content as string) as Record<string, unknown> };
    });
    expect(resultados.map((r) => r.id)).toEqual(["tu_1", "tu_2", "tu_3", "tu_4", "tu_5", "tu_6", "tu_7", "tu_8"]);
    expect(resultados[1].contenido.puntaje).toBe(FIJA.scoring.puntaje); // BCRA
    expect(resultados[3].contenido.fuente).toBe("MAV (simulado)"); // el MAV llega rotulado
    expect(resultados[4].contenido.disponible).toBe(false); // sin balance cargado, lo dice
    expect(resultados[5].contenido.nombre).toBe("Tecnología y comercio electrónico");
    expect(resultados[6].contenido.mensaje).toMatch(/no cargó una garantía/); // sin garantía, lo dice
    expect(resultados[7].contenido.precioCompra).toBe(FIJA.precioCompra); // cotización
  });

  it("si Claude pide varias herramientas a la vez, devuelve un tool_result por cada una, juntos", async () => {
    const paralelo = respuesta([
      { type: "text", text: "Reúno todo junto." },
      { type: "tool_use", id: "tu_a", name: "ver_politica_del_fondo", input: {} },
      { type: "tool_use", id: "tu_b", name: "consultar_bcra", input: {} },
      { type: "tool_use", id: "tu_c", name: "ver_cartera_actual", input: {} },
    ]);
    const { cliente, llamadas } = clienteSimulado([paralelo, uso("tu_d", "emitir_cotizacion"), concluir("aprobar", "Es un cheque de bajo riesgo.")]);
    const r = await analizarCheque(input, { analista: crearAnalistaLlm({ cliente }) });
    expect(r.modo).toBe("agente");
    const ultimo = llamadas[1].messages[llamadas[1].messages.length - 1];
    const bloques = ultimo.content as Anthropic.ToolResultBlockParam[];
    expect(bloques.map((b) => b.tool_use_id)).toEqual(["tu_a", "tu_b", "tu_c"]);
    expect(bloques.every((b) => typeof b.content === "string" && b.content !== "undefined")).toBe(true);
    expect(JSON.parse(bloques[1].content as string).puntaje).toBe(FIJA.scoring.puntaje);
  });

  it("no deja que el modelo elija el CUIT ni las cifras: las herramientas no tienen parámetros", () => {
    for (const t of HERRAMIENTAS_LLM.filter((x) => x.name !== "concluir")) {
      expect(t.input_schema.properties).toEqual({});
    }
  });

  it("no aprueba lo que las reglas rechazan aunque Claude lo pida", async () => {
    const { cliente } = clienteSimulado(guion());
    const rechazada: Cotizacion = { ...FIJA, aprobada: false, motivoRechazo: "Banda D: no se compra." };
    const h = { emitir_cotizacion: async () => rechazada };
    const { herramientasPorDefecto } = await import("./herramientas");
    const r = await analizarCheque(input, { analista: crearAnalistaLlm({ cliente }), herramientas: { ...herramientasPorDefecto(), ...h } });
    expect(r.cotizacion.aprobada).toBe(false);
  });

  it("cae al determinístico si la API falla", async () => {
    const cliente: ClienteMensajes = { messages: { create: async () => { throw new Error("401 sin clave"); } } };
    const r = await analizarCheque(input, { analista: crearAnalistaLlm({ cliente }) });
    expect(r.modo).toBe("determinista");
    expect(r.cotizacion.aprobada).toBe(true);
  });

  it("cae al determinístico si Claude termina sin concluir, pide algo desconocido o se rehúsa", async () => {
    for (const mala of [
      respuesta([{ type: "text", text: "Listo." }], "end_turn"),
      uso("tu_x", "borrar_todo"),
      respuesta([], "refusal"),
      concluir("quizás", "no sé"),
      respuesta([{ type: "tool_use", id: "tu_y", name: "concluir", input: { decision: "aprobar" } }]), // sin resumen
    ]) {
      const { cliente } = clienteSimulado([mala]);
      const r = await analizarCheque(input, { analista: crearAnalistaLlm({ cliente }) });
      expect(r.modo).toBe("determinista");
    }
  });

  it("filtra 'rinde' en el resumen del modelo", async () => {
    const g = guion();
    g[8] = concluir("aprobar", "El ARGt rinde mucho.");
    const { cliente } = clienteSimulado(g);
    const r = await analizarCheque(input, { analista: crearAnalistaLlm({ cliente }) });
    expect(r.cotizacion.decisionPM?.resumen).toBe(FIJA.explicacion);
  });
});

describe("selección del analista", () => {
  const limpiar = () => { vi.stubEnv("ANTHROPIC_API_KEY", ""); vi.stubEnv("OPENROUTER_API_KEY", ""); vi.stubEnv("AGENT_MODE", ""); };

  it("sin claves usa el determinístico (gratis)", () => {
    limpiar();
    expect(proveedorActivo()).toBe("ninguno");
    expect(hayClaveDeModelo()).toBe(false);
    expect(seleccionarAnalista().modo).toBe("determinista");
  });
  it("con clave de Anthropic usa a Claude directo", () => {
    limpiar();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-de-prueba");
    expect(proveedorActivo()).toBe("anthropic");
    expect(seleccionarAnalista().modo).toBe("agente");
  });
  it("con clave de OpenRouter usa a Claude vía OpenRouter (tiene prioridad)", () => {
    limpiar();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-de-prueba");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-de-prueba");
    expect(proveedorActivo()).toBe("openrouter");
    expect(seleccionarAnalista().modo).toBe("agente");
  });
  it("AGENT_MODE=determinista apaga el modelo aunque haya clave", () => {
    limpiar();
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-de-prueba");
    vi.stubEnv("AGENT_MODE", "determinista");
    expect(seleccionarAnalista().modo).toBe("determinista");
  });
  it("el cliente de OpenRouter apunta a OpenRouter y usa el token como bearer", () => {
    const c = crearClienteOpenRouter("sk-or-de-prueba");
    expect(c.baseURL).toBe("https://openrouter.ai/api");
    expect(c.authToken).toBe("sk-or-de-prueba");
    expect(c.apiKey).toBeNull();
  });
  it("por OpenRouter el modelo por defecto es Haiku 5.5 y se puede cambiar con AGENT_MODEL", async () => {
    expect(MODELO_OPENROUTER_POR_DEFECTO).toBe("anthropic/claude-haiku-5.5");
    const { cliente, llamadas } = clienteSimulado(guion());
    await analizarCheque(input, { analista: crearAnalistaLlm({ cliente, modelo: "anthropic/claude-sonnet-5.5" }) });
    expect(llamadas[0].model).toBe("anthropic/claude-sonnet-5.5");
  });
  it("da más tiempo cuando hay modelo", () => {
    expect(timeoutDelAnalista({ modo: "agente", siguiente: async () => ({ tipo: "pensar", titulo: "", detalle: "" }) })).toBeGreaterThan(30_000);
  });
});
