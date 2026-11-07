import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, api, esErrorDeAcceso, mensajeDeError } from "./api-client";

const responder = (cuerpo: unknown, status = 200) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(cuerpo), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("api-client", () => {
  it("devuelve el JSON si todo sale bien", async () => {
    responder({ tx: "0x1" });
    expect(await api.post<{ tx: string }>("/api/x", { a: 1 })).toEqual({ tx: "0x1" });
  });

  it("convierte { error } en ApiClientError con código y mensaje", async () => {
    responder({ error: { codigo: "CONCENTRACION_EXCEDIDA", mensaje: "Tope del 40%." } }, 409);
    const e = await api.post("/api/x").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiClientError);
    expect(mensajeDeError(e)).toEqual({ codigo: "CONCENTRACION_EXCEDIDA", mensaje: "Tope del 40%." });
  });

  it("si no hay red, devuelve un error en castellano", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fail"))));
    const e = await api.get("/api/x").catch((x: unknown) => x);
    expect(mensajeDeError(e).codigo).toBe("RED");
  });

  it("maneja respuestas que no son JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    const e = await api.get("/api/x").catch((x: unknown) => x);
    expect(mensajeDeError(e).codigo).toBe("RESPUESTA_INVALIDA");
  });

  it("reconoce el error de acceso (falta la clave de la demo) y no otros", () => {
    expect(esErrorDeAcceso("NO_AUTORIZADO")).toBe(true);
    expect(esErrorDeAcceso("SIN_KYC")).toBe(false);
    expect(esErrorDeAcceso("RED")).toBe(false);
  });
});
