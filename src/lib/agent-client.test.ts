import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputCotizacion } from "@/shared/types";
import { ApiClientError } from "./api-client";
import { analizarEnVivo } from "./agent-client";
import { codificarEvento, parsearEvento, separarLineas, type EventoAgente } from "./agent/stream";
import { analizarCheque } from "./agent";

const input: InputCotizacion = { cuit: "30703088534", nominal: "10000000", vencimiento: "2027-01-05", pyme: "0x1" };
afterEach(() => vi.unstubAllGlobals());

function respuestaStream(textos: string[], status = 200): Response {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({ start(c) { for (const t of textos) c.enqueue(enc.encode(t)); c.close(); } }), { status });
}
const stubFetch = (r: Response) => vi.stubGlobal("fetch", vi.fn(async () => r));

describe("formato de eventos", () => {
  it("separarLineas junta lo que llega partido", () => {
    const a = separarLineas("", '{"tipo":"reinicio"}\n{"tipo":"pa');
    expect(a.lineas).toEqual(['{"tipo":"reinicio"}']);
    const b = separarLineas(a.resto, 'so"}\n');
    expect(b.lineas).toEqual(['{"tipo":"paso"}']);
    expect(b.resto).toBe("");
  });
  it("parsearEvento acepta los tipos conocidos y rechaza el resto", () => {
    expect(parsearEvento('{"tipo":"reinicio"}')).toEqual({ tipo: "reinicio" });
    expect(() => parsearEvento('{"tipo":"otro"}')).toThrow();
    expect(() => parsearEvento("no es json")).toThrow();
  });
});

describe("analizarEnVivo", () => {
  it("entrega cada paso apenas llega y devuelve el resultado, aunque los chunks corten una línea", async () => {
    const real = await analizarCheque(input);
    const eventos: EventoAgente[] = [...real.pasos.map((paso): EventoAgente => ({ tipo: "paso", paso })), { tipo: "resultado", resultado: real }];
    const texto = eventos.map(codificarEvento).join("");
    const corte = Math.floor(texto.length / 3);
    stubFetch(respuestaStream([texto.slice(0, corte), texto.slice(corte, corte * 2 + 7), texto.slice(corte * 2 + 7)]));
    const vistos: number[] = [];
    const r = await analizarEnVivo(input, { onPaso: (p) => vistos.push(p.n), onReinicio: () => {} });
    expect(vistos).toEqual(real.pasos.map((p) => p.n));
    expect(r.cotizacion.id).toBe(real.cotizacion.id);
  });

  it("manda tipo, garantía y balance al servidor", async () => {
    const real = await analizarCheque(input);
    const f = vi.fn(async (_url: string, _init?: RequestInit) => respuestaStream([codificarEvento({ tipo: "resultado", resultado: real })]));
    vi.stubGlobal("fetch", f);
    const extra = { ...input, tipo: "pagare" as const, garantia: { tipo: "vehiculo" as const, descripcion: "Camioneta", valorDeclarado: "8000000" }, balance: "Ventas: 1.000" };
    await analizarEnVivo(extra, { onPaso: () => {}, onReinicio: () => {} });
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toMatchObject({ tipo: "pagare", garantia: { tipo: "vehiculo", valorDeclarado: "8000000" }, balance: "Ventas: 1.000" });
  });

  it("avisa el reinicio", async () => {
    const real = await analizarCheque(input);
    stubFetch(respuestaStream([codificarEvento({ tipo: "reinicio" }), codificarEvento({ tipo: "resultado", resultado: real })]));
    const onReinicio = vi.fn();
    await analizarEnVivo(input, { onPaso: () => {}, onReinicio });
    expect(onReinicio).toHaveBeenCalledTimes(1);
  });

  it("convierte un evento de error en ApiClientError", async () => {
    stubFetch(respuestaStream([codificarEvento({ tipo: "error", codigo: "ANALISIS_FALLIDO", mensaje: "Probá de nuevo." })]));
    const e = await analizarEnVivo(input, { onPaso: () => {}, onReinicio: () => {} }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiClientError);
    expect((e as ApiClientError).codigo).toBe("ANALISIS_FALLIDO");
  });

  it("si el flujo se corta sin resultado, lo dice", async () => {
    stubFetch(respuestaStream([codificarEvento({ tipo: "reinicio" })]));
    const e = await analizarEnVivo(input, { onPaso: () => {}, onReinicio: () => {} }).catch((x: unknown) => x);
    expect((e as ApiClientError).codigo).toBe("ANALISIS_INCOMPLETO");
  });

  it("respeta el error HTTP con formato { error }", async () => {
    stubFetch(new Response(JSON.stringify({ error: { codigo: "DATOS_INVALIDOS", mensaje: "Faltan datos." } }), { status: 400 }));
    const e = await analizarEnVivo(input, { onPaso: () => {}, onReinicio: () => {} }).catch((x: unknown) => x);
    expect((e as ApiClientError).codigo).toBe("DATOS_INVALIDOS");
  });

  it("si no hay red, da un error en castellano", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fail"))));
    const e = await analizarEnVivo(input, { onPaso: () => {}, onReinicio: () => {} }).catch((x: unknown) => x);
    expect((e as ApiClientError).codigo).toBe("RED");
  });
});
