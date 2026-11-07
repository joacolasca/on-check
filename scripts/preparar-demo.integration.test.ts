// La demo de partida contra el contrato v2 REAL (anvil, deploy del script real): corre `preparar-demo` sobre las rutas de la API
// y comprueba la regla de la demo: tras fondear los activos de partida, liquidez >= 15 %, ningún emisor > 10 % ni industria > 25 %;
// después, en vivo: MercadoLibre pasa y el segundo cheque al mismo emisor lo rechaza el contrato (regla del 10 %).
// Se saltea solo si falta anvil, forge o el contrato compilado.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AHORA_FIJO_MS, CLAVE_DEMO, arrancarCadena, entornoDeApi, hayEntornoDeCadena, type Cadena } from "@/lib/chain/testanvil";
import type { ChequeVista, Cotizacion, ResumenFondo } from "@/shared/types";
import { prepararDemo } from "./preparar-demo.mjs";

const fixtures = JSON.parse(readFileSync(new URL("../shared/fixtures/cheques-demo.json", import.meta.url), "utf8"));
const ENV_ORIGINAL = { ...process.env };
let cadena: Cadena | undefined;

/** `fetch` que en vez de salir a la red llama a los Route Handlers de Next. */
async function fetchALasRutas(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(url));
  const req = new Request(u, init);
  const ruta = u.pathname;
  const fondear = /^\/api\/cheques\/([^/]+)\/fondear$/.exec(ruta);
  if (fondear) return (await import("@/app/api/cheques/[id]/fondear/route")).POST(req, { params: Promise.resolve({ id: fondear[1] }) });
  const modulo = await import(`@/app${ruta}/route`);
  return (modulo[(init?.method ?? "GET").toUpperCase()] as (r: Request) => Promise<Response>)(req);
}

describe.skipIf(!hayEntornoDeCadena)("preparar-demo contra el contrato v2 real", () => {
  vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

  beforeAll(async () => {
    vi.useFakeTimers({ now: AHORA_FIJO_MS, toFake: ["Date"], shouldAdvanceTime: true });
    cadena = await arrancarCadena();
    Object.assign(process.env, entornoDeApi(cadena));
  });

  afterAll(() => {
    vi.useRealTimers();
    cadena?.parar();
    for (const k of Object.keys(process.env)) if (!(k in ENV_ORIGINAL)) delete process.env[k];
    Object.assign(process.env, ENV_ORIGINAL);
  });

  it("deja la cartera de partida dentro de las reglas del fondo y permite el camino en vivo de MercadoLibre", async () => {
    const resumen = await prepararDemo({ base: "http://demo", fixtures, fetchFn: fetchALasRutas as typeof fetch, log: () => {}, hoy: new Date(AHORA_FIJO_MS), clave: CLAVE_DEMO });
    expect(resumen.map((r: { estado: string }) => r.estado)).toEqual(["Funded", "Funded", "Funded", "Funded", "Pending"]);

    const fondo = async () => (await (await fetchALasRutas("http://demo/api/fondo")).json()) as ResumenFondo;
    const f = await fondo();
    // 70.000 + 30.000 cuotapartes enteras: la segunda sale un pelo bajo $ 30.000.000 porque entre los dos depósitos se devengó comisión
    expect(Number(f.totalAssets)).toBeGreaterThan(99_999_000);
    expect(Number(f.totalAssets)).toBeLessThanOrEqual(100_000_000);
    expect(Number(f.cuotapartesEmitidas)).toBeCloseTo(100_000, 0);
    expect(f.cantidadCheques).toMatchObject({ Funded: 4, Pending: 1 });
    expect(f.liquidezBps).toBeGreaterThanOrEqual(1500); // liquidez mínima del 15 %
    expect(f.composicion.porIndustria.map((p) => p.etiqueta)).not.toContain("Sin clasificar"); // el agente clasificó a todos
    // los bps de la composición son sobre la cartera; las reglas del contrato son sobre el patrimonio
    const sobrePatrimonio = (monto: string) => (Number(monto) / Number(f.totalAssets)) * 10_000;
    for (const p of f.composicion.porEmisor) expect(sobrePatrimonio(p.monto)).toBeLessThanOrEqual(1000); // ningún emisor > 10 %
    for (const p of f.composicion.porIndustria) expect(sobrePatrimonio(p.monto)).toBeLessThanOrEqual(2500);

    // en vivo: MercadoLibre $ 9.000.000 entra (8,6 % del patrimonio)...
    const post = (ruta: string, body: unknown) => fetchALasRutas(`http://demo${ruta}`, { method: "POST", headers: { "content-type": "application/json", "x-demo-clave": CLAVE_DEMO }, body: JSON.stringify(body) });
    const hoyMas = (dias: number) => new Date(AHORA_FIJO_MS + dias * 86_400_000).toISOString().slice(0, 10);
    const cotizar = async (nominal: string, dias: number) => ((await (await post("/api/agente/analizar", { cuit: "30703088534", nominal, vencimiento: hoyMas(dias) })).json()) as { cotizacion: Cotizacion }).cotizacion;
    const uno = await cotizar("9000000", 60);
    expect((await post("/api/cheques", { cotizacionId: uno.id, cotizacion: uno })).status).toBe(200);
    expect((await post(`/api/cheques/${uno.id}/fondear`, {})).status).toBe(200);
    // ...y un segundo cheque al mismo emisor, de $ 4.000.000, ya lo rechaza el gestor al analizarlo (el servidor aplica el tope del 10 %
    // con la misma cuenta que el contrato) y no se puede registrar; el contrato diría lo mismo.
    const dos = await cotizar("4000000", 45);
    expect(dos.aprobada).toBe(false);
    expect(dos.motivoRechazo).toMatch(/El emisor quedaría en 12,\d+ % del fondo, por encima del tope de 10 %/);
    const r = await post("/api/cheques", { cotizacionId: dos.id, cotizacion: dos });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: { codigo: string } }).error.codigo).toBe("COTIZACION_RECHAZADA");

    const despues = await fondo();
    expect(despues.liquidezBps).toBeGreaterThanOrEqual(1500);
    const lista = (await (await fetchALasRutas("http://demo/api/cheques")).json()) as ChequeVista[];
    expect(lista.find((c) => c.id === dos.id)).toBeUndefined();
  });
});
