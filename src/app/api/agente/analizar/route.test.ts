// Ruta del gestor (v2): validación de tipo, garantía y balance, y forma de la respuesta. Sin modelo (AGENT_MODE=determinista): no gasta API.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cotizacion } from "@/shared/types";
import type { ResultadoAgente } from "@/lib/agent/types";
import { MIME_NDJSON, parsearEvento } from "@/lib/agent/stream";
import { cotizacionIntegra } from "@/lib/scoring/cotizar";
import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("AGENT_MODE", "determinista");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("SCORING_MODE", "mock");
  vi.stubEnv("BCRA_MODE", "cache");
});

const base = { cuit: "30703088534", nominal: "10000000", vencimiento: "2027-01-05" };
const pedir = (body: unknown, accept?: string) =>
  POST(new Request("http://localhost/api/agente/analizar", { method: "POST", headers: { "content-type": "application/json", ...(accept ? { accept } : {}) }, body: JSON.stringify(body) }));
const codigo = async (r: Response) => ((await r.json()) as { error: { codigo: string; mensaje: string } }).error.codigo;
// La firma de la ruta va fuera del hash de la cotización.
const sinFirma = (c: Cotizacion): Cotizacion => {
  const { firma: _f, ...resto } = c;
  void _f;
  return resto;
};
const garantia = { tipo: "vehiculo", descripcion: "Camioneta de ejemplo", valorDeclarado: "20000000", documentos: ["Tasación"] };

describe("POST /api/agente/analizar · v2", () => {
  it("sin los campos nuevos funciona como antes y devuelve una cotización v2 (cheque, industria, MAV simulado)", async () => {
    const r = await pedir(base);
    expect(r.status).toBe(200);
    const x = (await r.json()) as ResultadoAgente;
    expect(x.cotizacion.tipo).toBe("cheque");
    expect(x.cotizacion.industria.id).toBe(2);
    expect(x.cotizacion.mav?.fuente).toBe("MAV (simulado)");
    expect(x.cotizacion.garantia).toBeUndefined();
    expect(x.cotizacion.decisionPM?.decision).toBe("aprobar");
    expect(x.cotizacion.firma).toBeDefined();
    expect(cotizacionIntegra(sinFirma(x.cotizacion))).toBe(true);
    expect(x.pasos.map((p) => p.herramienta).filter(Boolean)).toContain("consultar_mav");
  });

  it("acepta un pagaré con garantía y balance, y devuelve el análisis de garantía sin el texto del balance", async () => {
    const r = await pedir({ ...base, tipo: "pagare", garantia, balance: "Ventas netas: $ 1.000.000\nPatrimonio neto: 500.000" });
    expect(r.status).toBe(200);
    const x = (await r.json()) as ResultadoAgente;
    expect(x.cotizacion.tipo).toBe("pagare");
    expect(x.cotizacion.garantia).toMatchObject({ tipo: "vehiculo", coberturaBps: 14_000, haircutBps: 3000, analizadoPor: "determinista" });
    expect(x.cotizacion.garantia?.garantiaHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(x.cotizacion.decisionPM?.decision).toBe("aprobar_con_condiciones");
    expect(x.cotizacion.input.balance).toBeUndefined();
    expect(JSON.stringify(x)).not.toMatch(/Patrimonio neto: 500\.000/);
    expect(cotizacionIntegra(sinFirma(x.cotizacion))).toBe(true);
  });

  it("garantía de tipo 'ninguna' equivale a no mandarla", async () => {
    const x = (await (await pedir({ ...base, garantia: { tipo: "ninguna" } })).json()) as ResultadoAgente;
    expect(x.cotizacion.garantia).toBeUndefined();
  });

  it("con accept NDJSON transmite los pasos nuevos y termina con el resultado", async () => {
    const r = await pedir({ ...base, garantia }, MIME_NDJSON);
    const eventos = (await r.text()).split("\n").filter(Boolean).map(parsearEvento);
    const titulos = eventos.flatMap((e) => (e.tipo === "paso" ? [e.paso.titulo] : []));
    expect(titulos).toContain("Consulto el MAV (simulado)");
    expect(titulos).toContain("Estimo la industria del emisor");
    expect(titulos).toContain("Analizo la garantía ofrecida");
    expect(eventos.at(-1)?.tipo).toBe("resultado");
  });

  const invalidos: [string, Record<string, unknown>][] = [
    ["tipo inexistente", { tipo: "letra" }],
    ["garantía que no es un objeto", { garantia: "auto" }],
    ["tipo de garantía inexistente", { garantia: { ...garantia, tipo: "yate" } }],
    ["garantía sin descripción", { garantia: { ...garantia, descripcion: "  " } }],
    ["descripción demasiado larga", { garantia: { ...garantia, descripcion: "x".repeat(501) } }],
    ["valor declarado como número", { garantia: { ...garantia, valorDeclarado: 20000000 } }],
    ["valor declarado con coma", { garantia: { ...garantia, valorDeclarado: "20.000.000,50" } }],
    ["valor declarado cero", { garantia: { ...garantia, valorDeclarado: "0" } }],
    ["documentos que no son lista", { garantia: { ...garantia, documentos: "tasación" } }],
    ["demasiados documentos", { garantia: { ...garantia, documentos: Array.from({ length: 11 }, () => "doc") } }],
    ["balance que no es texto", { balance: 123 }],
    ["balance demasiado largo", { balance: "x".repeat(20_001) }],
  ];
  it.each(invalidos)("rechaza %s con DATOS_INVALIDOS (400)", async (_nombre, extra) => {
    const r = await pedir({ ...base, ...extra });
    expect(r.status).toBe(400);
    expect(await codigo(r)).toBe("DATOS_INVALIDOS");
  });

  it("sigue exigiendo cuit, nominal y vencimiento", async () => {
    expect(await codigo(await pedir({ cuit: "30703088534" }))).toBe("DATOS_INVALIDOS");
  });
});
