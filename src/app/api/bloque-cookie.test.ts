// Cookie de bloque mínimo: se setea tras escribir, conserva la mayor e ignora valores inválidos.
import { describe, expect, it } from "vitest";
import { bloqueDeCookie, conEscritura } from "./_lib/bloque";

const req = (cookie?: string) => new Request("http://localhost/api/x", { headers: cookie ? { cookie } : {} });

describe("cookie fc_bloque", () => {
  it("se setea tras escribir, con los atributos pedidos y sin cambiar el JSON", async () => {
    const res = await conEscritura(req(), async (alBloque) => (alBloque(120n), Response.json({ tx: "0x1" })));
    const c = res.headers.get("set-cookie") ?? "";
    expect(c).toContain("fc_bloque=120");
    for (const a of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=600"]) expect(c).toContain(a);
    expect(await res.json()).toEqual({ tx: "0x1" });
  });
  it("conserva la mayor entre la cookie previa y el recibo", async () => {
    const a = await conEscritura(req("fc_bloque=500"), async (al) => (al(120n), Response.json({})));
    expect(a.headers.get("set-cookie")).toContain("fc_bloque=500;");
    const b = await conEscritura(req("fc_bloque=100"), async (al) => (al(120n), al(110n), Response.json({})));
    expect(b.headers.get("set-cookie")).toContain("fc_bloque=120;");
  });
  it("sin escritura (mock o error antes de firmar) no setea nada", async () => {
    const res = await conEscritura(req(), async () => Response.json({}));
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("valores inválidos se ignoran", () => {
    for (const v of ["abc", "-5", "1.5", "0x10", "", "1e3", "99999999999999999999"]) expect(bloqueDeCookie(req(`fc_bloque=${v}`))).toBeUndefined();
    expect(bloqueDeCookie(req())).toBeUndefined();
    expect(bloqueDeCookie(req("otra=1; fc_bloque=42; z=2"))).toBe(42n);
  });
});
