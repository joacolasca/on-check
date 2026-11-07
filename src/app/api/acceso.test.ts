// Acceso, CSRF, rate limit y topes de las rutas que firman (modo mock: sin contrato configurado).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearValorSesion, reiniciarLimites } from "./_lib/acceso";
import * as acceso from "./demo/acceso/route";
import * as cheques from "./cheques/route";
import * as fondear from "./cheques/[id]/fondear/route";
import * as invertir from "./demo/invertir/route";
import * as kyc from "./demo/kyc/route";
import * as liquidar from "./demo/liquidar/route";

const CLAVE = "clave-de-prueba-0123456789";
const ID = "0x" + "11".repeat(32);
const JSON_H = { "content-type": "application/json" };

type Cab = Record<string, string>;
const pedido = (ruta: string, body: unknown, cab: Cab = JSON_H) =>
  new Request(`http://localhost${ruta}`, { method: "POST", headers: cab, body: body === undefined ? undefined : JSON.stringify(body) });

const RUTAS: { nombre: string; llamar: (cab?: Cab) => Promise<Response> }[] = [
  { nombre: "kyc", llamar: (c) => kyc.POST(pedido("/api/demo/kyc", { cuenta: "inversor1" }, c)) },
  { nombre: "invertir", llamar: (c) => invertir.POST(pedido("/api/demo/invertir", { cuenta: "inversor1", cuotapartes: "1000" }, c)) },
  { nombre: "liquidar", llamar: (c) => liquidar.POST(pedido("/api/demo/liquidar", { chequeId: ID, resultado: "pagado" }, c)) },
  { nombre: "cheques", llamar: (c) => cheques.POST(pedido("/api/cheques", { cotizacionId: ID }, c)) },
  { nombre: "fondear", llamar: (c) => fondear.POST(pedido(`/api/cheques/${ID}/fondear`, undefined, c), { params: Promise.resolve({ id: ID }) }) },
];
const codigo = async (r: Response) => ((await r.json()) as { error: { codigo: string } }).error.codigo;

beforeEach(() => {
  vi.stubEnv("DEMO_CLAVE", CLAVE);
  vi.stubEnv("API_MODE", "mock"); // sin contrato: los datos de prueba solo con API_MODE=mock (si no, 503 CONTRATO_NO_CONFIGURADO)
  reiniciarLimites();
});
afterEach(() => vi.unstubAllEnvs());

describe.each(RUTAS)("ruta protegida: $nombre", ({ llamar }) => {
  it("sin credencial → 401", async () => {
    const r = await llamar();
    expect(r.status).toBe(401);
    expect(await codigo(r)).toBe("NO_AUTORIZADO");
  });
  it("header incorrecto → 401", async () => expect((await llamar({ ...JSON_H, "x-demo-clave": "otra-clave-incorrecta-1" })).status).toBe(401));
  it("header correcto → pasa", async () => expect((await llamar({ ...JSON_H, "x-demo-clave": CLAVE })).status).toBe(200));
  it("cookie válida → pasa", async () => expect((await llamar({ ...JSON_H, cookie: `demo_sesion=${crearValorSesion()}` })).status).toBe(200));
  it("cookie vencida → 401", async () => {
    const vieja = crearValorSesion(Date.now() - 13 * 3600_000);
    expect((await llamar({ ...JSON_H, cookie: `demo_sesion=${vieja}` })).status).toBe(401);
  });
  it("cookie adulterada → 401", async () => {
    const [exp, firma] = crearValorSesion()!.split(".");
    expect((await llamar({ ...JSON_H, cookie: `demo_sesion=${Number(exp) + 99999}.${firma}` })).status).toBe(401);
  });
  it("cookie con Origin ajeno → 403", async () => {
    expect((await llamar({ ...JSON_H, cookie: `demo_sesion=${crearValorSesion()}`, origin: "https://malo.example" })).status).toBe(403);
  });
  it("cookie con Origin propio → pasa", async () => {
    expect((await llamar({ ...JSON_H, cookie: `demo_sesion=${crearValorSesion()}`, origin: "http://localhost" })).status).toBe(200);
  });
  it("sin content-type json → 415", async () => {
    const r = await llamar({ "x-demo-clave": CLAVE, "content-type": "text/plain" });
    expect(r.status).toBe(415);
    expect(await codigo(r)).toBe("DATOS_INVALIDOS");
  });
  it("en producción sin DEMO_CLAVE falla cerrado → 503", async () => {
    vi.stubEnv("DEMO_CLAVE", "");
    vi.stubEnv("NODE_ENV", "production");
    const r = await llamar({ ...JSON_H, "x-demo-clave": CLAVE });
    expect(r.status).toBe(503);
    expect(await codigo(r)).toBe("CONFIGURACION");
  });
});

describe("sin DEMO_CLAVE en desarrollo", () => {
  it("deja pasar (pero exige JSON)", async () => {
    vi.stubEnv("DEMO_CLAVE", "");
    expect((await RUTAS[0].llamar()).status).toBe(200);
    expect((await RUTAS[0].llamar({ "content-type": "text/plain" })).status).toBe(415);
  });
});

describe("rate limit", () => {
  it("21.ª operación del minuto desde la misma IP → 429 con Retry-After", async () => {
    const cab = { ...JSON_H, "x-demo-clave": CLAVE, "x-forwarded-for": "9.9.9.9, 1.1.1.1" };
    for (let i = 0; i < 20; i++) expect((await RUTAS[0].llamar(cab)).status).toBe(200);
    const r = await RUTAS[0].llamar(cab);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await codigo(r)).toBe("DEMASIADAS_SOLICITUDES");
    expect((await RUTAS[0].llamar({ ...cab, "x-forwarded-for": "8.8.8.8" })).status).toBe(200); // otra IP sigue pasando
  });
  it("tope global de 60/min entre IPs", async () => {
    for (let i = 0; i < 60; i++) expect((await RUTAS[0].llamar({ ...JSON_H, "x-demo-clave": CLAVE, "x-forwarded-for": `10.0.${Math.floor(i / 10)}.${i}` })).status).toBe(200);
    expect((await RUTAS[0].llamar({ ...JSON_H, "x-demo-clave": CLAVE, "x-forwarded-for": "10.9.9.9" })).status).toBe(429);
  });
});

describe("/api/demo/acceso", () => {
  const form = (clave: string) =>
    new Request("http://localhost/api/demo/acceso", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ clave }).toString() });

  it("GET devuelve el formulario con el footer legal", async () => {
    const r = await acceso.GET();
    expect(r.headers.get("content-type")).toContain("text/html");
    const html = await r.text();
    expect(html).toContain('<form method="post"');
    expect(html).toContain("Prototipo en testnet · sin dinero real · no es oferta pública");
  });
  it("clave mala → 401 y sin cookie", async () => {
    const r = await acceso.POST(form("mala"));
    expect(r.status).toBe(401);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(await r.text()).not.toContain(CLAVE);
  });
  it("clave buena → 303 a /demo con cookie HttpOnly SameSite=Strict que sirve", async () => {
    const r = await acceso.POST(form(CLAVE));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/demo");
    const c = r.headers.get("set-cookie")!;
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Strict/);
    expect(c).toMatch(/Path=\//);
    expect(c).not.toMatch(/Secure/);
    expect(c).not.toContain(CLAVE);
    expect((await RUTAS[0].llamar({ ...JSON_H, cookie: c.split(";")[0] })).status).toBe(200);
  });
  it("cookie Secure en producción", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await acceso.POST(form(CLAVE))).headers.get("set-cookie")).toMatch(/Secure/);
  });
  it("anti fuerza bruta: el 6.º intento → 429", async () => {
    for (let i = 0; i < 5; i++) expect((await acceso.POST(form("mala"))).status).toBe(401);
    expect((await acceso.POST(form("mala"))).status).toBe(429);
  });
});

describe("topes de /api/demo/invertir", () => {
  const inv = (monto: unknown) => invertir.POST(pedido("/api/demo/invertir", { cuenta: "inversor1", monto }, { ...JSON_H, "x-demo-clave": CLAVE }));
  it("hasta el mayor depósito del pool de demo pasa; por encima → 400", async () => {
    expect((await inv("70000000")).status).toBe(200);
    expect((await inv("70000000.01")).status).toBe(400);
    expect((await inv("99999999999999999999")).status).toBe(400);
  });
  it.each(["0", "0.00", "10.123", "-5", "1e3", "abc", ""])("monto %j → 400", async (m) => expect((await inv(m)).status).toBe(400));
  it("monto que no es string → 400", async () => expect((await inv(1000)).status).toBe(400));
});

describe("lote de negociación en /api/demo/invertir (mínimo 1.000 cuotapartes, de a 1)", () => {
  const suscribir = (cuerpo: Record<string, unknown>) => invertir.POST(pedido("/api/demo/invertir", { cuenta: "inversor1", ...cuerpo }, { ...JSON_H, "x-demo-clave": CLAVE }));
  const codigo = async (r: Response) => ((await r.json()) as { error: { codigo: string; mensaje: string } }).error;
  it("1.000 cuotapartes pasa y devuelve { tx, shares, monto } de lo realmente suscripto", async () => {
    const r = await suscribir({ cuotapartes: "1000" });
    expect(r.status).toBe(200);
    const c = (await r.json()) as { tx: string; shares: string; monto: string };
    expect(c.shares).toBe("1000");
    expect(Number(c.monto)).toBeGreaterThan(0);
  });
  it("999 cuotapartes → MINIMO_CUOTAPARTES con el costo estimado del mínimo", async () => {
    const r = await suscribir({ cuotapartes: "999" });
    expect(r.status).toBe(400);
    const e = await codigo(r);
    expect(e.codigo).toBe("MINIMO_CUOTAPARTES");
    expect(e.mensaje).toMatch(/mínima es de 1\.000 cuotapartes \(≈ \$ [\d.,]+ al valor de hoy\)/);
  });
  it("por monto se suscribe floor(monto / valor): $ 900.000 son menos de 1.000 cuotapartes al valor del fixture", async () => {
    expect((await codigo(await suscribir({ monto: "900000" }))).codigo).toBe("MINIMO_CUOTAPARTES");
    const r = await suscribir({ monto: "2000000" });
    expect(r.status).toBe(200);
    const c = (await r.json()) as { shares: string; monto: string };
    expect(c.shares).toMatch(/^\d+$/); // siempre cuotapartes enteras
    expect(Number(c.monto)).toBeLessThanOrEqual(2_000_000);
  });
  it.each(["1000.5", "1.000", "-1000", "0", "abc", ""])("cuotapartes %j (no entero positivo) → 400", async (c) => expect((await suscribir({ cuotapartes: c })).status).toBe(400));
  it("cuotapartes que no es string → 400", async () => expect((await suscribir({ cuotapartes: 1000 })).status).toBe(400));
});
