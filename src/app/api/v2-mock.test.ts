// Rutas v2 en modo mock (API_MODE=mock, sin contrato): fondo, cheques, rescates, posición, liquidación y modo demo.
import chequesFixture from "@fixtures/api/cheques.json";
import fondoFixture from "@fixtures/api/fondo.json";
import { parseUnits } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { componer } from "@/lib/chain/composicion";
import { idIndustriaPorNombre } from "@/lib/chain/industrias";
import type { ResultadoLiquidacion } from "@/lib/chain/rescates";
import type { ChequeVista, PosicionInversor, RescateVista, ResumenFondo } from "@/shared/types";
import { crearValorSesion, reiniciarLimites } from "./_lib/acceso";
import { reiniciarMock } from "./_lib/mock";
import * as cheques from "./cheques/route";
import * as modo from "./demo/modo/route";
import * as posicion from "./demo/posicion/route";
import * as rescatesPost from "./demo/rescates/route";
import * as liquidar from "./demo/rescates/liquidar/route";
import * as fondo from "./fondo/route";
import * as rescatesGet from "./rescates/route";

const CLAVE = "clave-de-prueba-0123456789";
const JSON_H = { "content-type": "application/json" };
const AUTH = { ...JSON_H, "x-demo-clave": CLAVE };
const post = (ruta: string, body: unknown, cab: Record<string, string> = AUTH) =>
  new Request(`http://localhost${ruta}`, { method: "POST", headers: cab, body: body === undefined ? undefined : JSON.stringify(body) });
const json = async <T>(r: Response) => (await r.json()) as T;
const codigo = async (r: Response) => (await json<{ error: { codigo: string } }>(r)).error.codigo;
const pedirRescate = (cuenta: string, cuotapartes: unknown, cab?: Record<string, string>) => rescatesPost.POST(post("/api/demo/rescates", { cuenta, cuotapartes }, cab));
const getPosicion = (cuenta: string) => posicion.GET(new Request(`http://localhost/api/demo/posicion?cuenta=${cuenta}`));

beforeEach(() => {
  vi.stubEnv("DEMO_CLAVE", CLAVE);
  vi.stubEnv("API_MODE", "mock");
  vi.stubEnv("CHEQUE_FUND_ADDRESS", "");
  reiniciarLimites();
  reiniciarMock();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/fondo (mock v2)", () => {
  it("devuelve el ResumenFondo v2 completo", async () => {
    const f = await json<ResumenFondo>(await fondo.GET());
    expect(f.politica).toEqual({ maxEmisorBps: 1000, maxIndustriaBps: 2500, liquidezMinBps: 1500, objetivoTnaBps: 4000, comisionAnualBps: 300, precioInicialCuotaparte: "1000", minCuotapartes: "1000", rescateHorasHabiles: 24, rescateCorteHora: 15 });
    expect(f.modoDemo).toBe(false);
    expect(f.rescatesPendientes).toBe(0);
    expect(f.cuotapartesEmitidas).toBe("100000");
    expect(f.comision).toEqual({ devengadaCuotapartes: expect.any(String), devengadaPesos: expect.any(String) });
    expect(f.red).toBe("base-sepolia");
    expect(f.liquidezBps).toBeGreaterThan(f.politica.liquidezMinBps); // el fondo de ejemplo cumple su reserva
  });
  it("la composición suma 10000 bps por eje, sin repetir claves, y no deja a ningún emisor por encima del 10 % del patrimonio", async () => {
    const f = await json<ResumenFondo>(await fondo.GET());
    for (const eje of [f.composicion.porEmisor, f.composicion.porIndustria, f.composicion.porTipo]) {
      expect(eje.reduce((s, p) => s + p.bps, 0)).toBe(10_000);
      expect(new Set(eje.map((p) => p.clave)).size).toBe(eje.length);
    }
    expect(f.composicion.porTipo.map((p) => p.clave).sort()).toEqual(["cheque", "pagare"]); // hay cheques y pagarés
    expect(f.concentracionMaxBps).toBeLessThanOrEqual(f.politica.maxEmisorBps);
    expect(f.composicion.porEmisor.map((p) => p.etiqueta)).toContain("MERCADOLIBRE S.R.L.");
  });
  it("el fixture fondo.json y los cheques de ejemplo son coherentes entre sí", async () => {
    const w = (d: string) => parseUnits(d, 18);
    const funded = (chequesFixture as unknown as ChequeVista[]).filter((c) => c.estado === "Funded");
    const comp = componer(funded.map((c) => ({ emisor: c.libradorHashCorto, emisorEtiqueta: c.emisorNombre ?? c.libradorHashCorto, industria: idIndustriaPorNombre(c.industria) ?? 0, tipo: c.tipo, monto: w(c.precioCompra) })));
    expect(fondoFixture.composicion).toEqual(comp);
    expect(fondoFixture.cantidadCheques.Funded).toBe(funded.length);
    expect(w(fondoFixture.liquidez) + w(fondoFixture.enCheques)).toBe(w(fondoFixture.totalAssets));
  });
});

describe("GET /api/cheques (mock v2)", () => {
  it("devuelve ChequeVista v2: tipo, industria por nombre, emisor y garantía", async () => {
    const lista = await json<ChequeVista[]>(await cheques.GET());
    expect(lista.length).toBeGreaterThan(0);
    for (const c of lista) {
      expect(["cheque", "pagare"]).toContain(c.tipo);
      expect(typeof c.industria).toBe("string");
      expect(c.emisorNombre === null || typeof c.emisorNombre === "string").toBe(true);
      if (c.garantia) expect(c.garantia.coberturaBps).toBeGreaterThan(0);
    }
    const conGarantia = lista.filter((c) => c.garantia);
    expect(conGarantia.length).toBeGreaterThanOrEqual(1);
    expect(conGarantia.every((c) => c.tipo === "pagare")).toBe(true);
    expect(new Set(lista.map((c) => c.estado))).toEqual(new Set(["Pending", "Funded", "Paid", "Rejected"]));
  });
});

describe("POST /api/demo/rescates", () => {
  it("exige el acceso de la demo: sin credencial 401, con cookie ajena 403, sin JSON 415", async () => {
    expect((await pedirRescate("inversor1", "10", JSON_H)).status).toBe(401);
    expect(await codigo(await pedirRescate("inversor1", "10", JSON_H))).toBe("NO_AUTORIZADO");
    expect((await pedirRescate("inversor1", "10", { ...JSON_H, cookie: `demo_sesion=${crearValorSesion()}`, origin: "https://malo.example" })).status).toBe(403);
    expect((await pedirRescate("inversor1", "10", { "x-demo-clave": CLAVE, "content-type": "text/plain" })).status).toBe(415);
    expect((await pedirRescate("inversor1", "10", { ...JSON_H, cookie: `demo_sesion=${crearValorSesion()}` })).status).toBe(200); // la sesión también vale
  });
  it("solicita el rescate: queda Pendiente, con tx de ejemplo y plazo de 24 horas hábiles", async () => {
    const ahora = Date.now();
    const r = await pedirRescate("inversor1", "1000.5");
    expect(r.status).toBe(200);
    const cuerpo = await json<{ tx: string; rescate: RescateVista }>(r);
    expect(cuerpo.tx).toBe("0x" + "ab".repeat(32)); // tx de ejemplo, no real
    expect(cuerpo.rescate).toMatchObject({ id: "1", cuotapartes: "1000.5", estado: "Pendiente", monto: null });
    expect(Date.parse(cuerpo.rescate.liquidableDesde)).toBeGreaterThan(ahora);
    expect(Date.parse(cuerpo.rescate.liquidableDesde) - ahora).toBeLessThanOrEqual(4 * 24 * 3_600_000); // fin de semana incluido
  });
  it.each([
    [{ cuenta: "otra", cuotapartes: "1" }],
    [{ cuenta: "inversor1" }],
    [{ cuenta: "inversor1", cuotapartes: 10 }],
    [{ cuenta: "inversor1", cuotapartes: "0" }],
    [{ cuenta: "inversor1", cuotapartes: "0.000" }],
    [{ cuenta: "inversor1", cuotapartes: "-3" }],
    [{ cuenta: "inversor1", cuotapartes: "1e3" }],
    [{ cuenta: "inversor1", cuotapartes: "1.1234567" }],
  ])("datos inválidos %j → 400 DATOS_INVALIDOS", async (body) => {
    const r = await rescatesPost.POST(post("/api/demo/rescates", body));
    expect(r.status).toBe(400);
    expect(await codigo(r)).toBe("DATOS_INVALIDOS");
  });
  it("más cuotapartes de las que tiene → 409 CUOTAPARTES_INSUFICIENTES, y no queda ningún rescate", async () => {
    const r = await pedirRescate("inversor2", "30000.000001");
    expect(r.status).toBe(409);
    expect(await codigo(r)).toBe("CUOTAPARTES_INSUFICIENTES");
    expect(await json<unknown[]>(await rescatesGet.GET())).toEqual([]);
  });
  it("las cuotapartes salen de la posición (quedan en custodia) y suben los pendientes del fondo", async () => {
    expect(await json<PosicionInversor>(await getPosicion("inversor1"))).toMatchObject({ cuenta: "inversor1", cuotapartes: "70000", rescates: [] });
    await pedirRescate("inversor1", "1000");
    const p = await json<PosicionInversor>(await getPosicion("inversor1"));
    expect(p.cuotapartes).toBe("69000");
    expect(p.rescates).toHaveLength(1);
    expect((await json<ResumenFondo>(await fondo.GET())).rescatesPendientes).toBe(1);
  });
});

describe("GET /api/rescates y GET /api/demo/posicion", () => {
  it("lista los rescates de todos y la posición filtra los del inversor", async () => {
    await pedirRescate("inversor1", "10");
    await pedirRescate("inversor2", "20");
    const todos = await json<RescateVista[]>(await rescatesGet.GET());
    expect(todos.map((r) => [r.id, r.cuotapartes])).toEqual([["1", "10"], ["2", "20"]]);
    const p2 = await json<PosicionInversor>(await getPosicion("inversor2"));
    expect(p2.rescates.map((r) => r.id)).toEqual(["2"]);
    expect(p2.cuotapartes).toBe("29980");
    expect(Number(p2.valor.split(".")[0])).toBeGreaterThan(0);
  });
  it("valor de la posición = cuotapartes × valor de cuotaparte", async () => {
    const f = await json<ResumenFondo>(await fondo.GET());
    const p = await json<PosicionInversor>(await getPosicion("inversor1"));
    const esperado = (parseUnits(p.cuotapartes, 18) * parseUnits(f.valorCuotaparte, 18)) / 10n ** 18n;
    expect(parseUnits(p.valor, 18)).toBe(esperado);
  });
  it("la cuenta tiene que ser inversor1 o inversor2", async () => {
    for (const c of ["", "pyme", "x"]) {
      const r = await getPosicion(c);
      expect(r.status).toBe(400);
      expect(await codigo(r)).toBe("DATOS_INVALIDOS");
    }
    expect((await posicion.GET(new Request("http://localhost/api/demo/posicion"))).status).toBe(400);
  });
});

describe("POST /api/demo/rescates/liquidar", () => {
  const liquidarYa = () => liquidar.POST(post("/api/demo/rescates/liquidar", undefined));
  it("exige el acceso de la demo", async () => {
    expect((await liquidar.POST(post("/api/demo/rescates/liquidar", undefined, JSON_H))).status).toBe(401);
  });
  it("sin modoDemo no liquida lo que todavía no venció, y lo explica", async () => {
    await pedirRescate("inversor1", "1000");
    const r = await json<ResultadoLiquidacion>(await liquidarYa());
    expect(r.liquidados).toEqual([]);
    expect(r.pendientesNoVencidos).toBe(1);
    expect(r.modoDemo).toBe(false);
    expect(r.explicacionGestor).toMatch(/24 horas hábiles/);
    expect((await json<RescateVista[]>(await rescatesGet.GET()))[0].estado).toBe("Pendiente");
  });
  it("sin rescates dice que no había nada", async () => {
    const r = await json<ResultadoLiquidacion>(await liquidarYa());
    expect(r.explicacionGestor).toBe("No había rescates pendientes para liquidar.");
  });
  it("con modoDemo liquida todos los pendientes: paga al valor de cuotaparte, baja patrimonio y cuotapartes, y explica la reserva del 15 %", async () => {
    const antes = await json<ResumenFondo>(await fondo.GET());
    await pedirRescate("inversor1", "1000");
    await modo.POST(post("/api/demo/modo", { activo: true }));
    const r = await json<ResultadoLiquidacion>(await liquidarYa());
    expect(r.modoDemo).toBe(true);
    expect(r.liquidados).toHaveLength(1);
    const monto = parseUnits(r.liquidados[0].monto, 18);
    expect(monto).toBe((1000n * parseUnits(antes.valorCuotaparte, 18)));
    expect(r.liquidados[0].tx).toBe("0x" + "ab".repeat(32));
    expect(r.reservaMinimaBps).toBe(1500);
    expect(r.explicacionGestor).toMatch(/Liquidé 1 rescate/);
    expect(r.explicacionGestor).toMatch(/reserva mínima del 15 %/);
    const despues = await json<ResumenFondo>(await fondo.GET());
    expect(despues.rescatesPendientes).toBe(0);
    expect(parseUnits(despues.totalAssets, 18)).toBe(parseUnits(antes.totalAssets, 18) - monto);
    expect(despues.cuotapartesEmitidas).toBe("99000");
    expect(parseUnits(despues.valorCuotaparte, 18)).toBe(parseUnits(antes.valorCuotaparte, 18)); // rescatar al valor de cuotaparte no lo mueve
    const [res] = await json<RescateVista[]>(await rescatesGet.GET());
    expect(res).toMatchObject({ estado: "Liquidado", monto: r.liquidados[0].monto });
  });
  it("si no alcanza la liquidez, el que no entra queda pendiente y el gestor lo explica", async () => {
    await pedirRescate("inversor1", "70000");
    await pedirRescate("inversor2", "30000");
    await modo.POST(post("/api/demo/modo", { activo: true }));
    const r = await json<ResultadoLiquidacion>(await liquidarYa());
    expect(r.liquidados.map((l) => l.id)).toEqual(["1"]);
    expect(r.omitidos.map((o) => o.id)).toEqual(["2"]);
    expect(r.omitidos[0].motivo).toMatch(/liquidez/);
    expect(r.explicacionGestor).toMatch(/falta de liquidez/);
    expect(r.explicacionGestor).toMatch(/por debajo de la reserva mínima del 15 %/);
    expect((await json<ResumenFondo>(await fondo.GET())).rescatesPendientes).toBe(1);
  });
});

describe("POST /api/demo/modo", () => {
  it("exige el acceso de la demo", async () => {
    expect((await modo.POST(post("/api/demo/modo", { activo: true }, JSON_H))).status).toBe(401);
  });
  it("prende y apaga modoDemo, y se ve en /api/fondo", async () => {
    const r = await json<{ tx: string; modoDemo: boolean }>(await modo.POST(post("/api/demo/modo", { activo: true })));
    expect(r).toEqual({ tx: "0x" + "ab".repeat(32), modoDemo: true });
    expect((await json<ResumenFondo>(await fondo.GET())).modoDemo).toBe(true);
    await modo.POST(post("/api/demo/modo", { activo: false }));
    expect((await json<ResumenFondo>(await fondo.GET())).modoDemo).toBe(false);
  });
  it.each([[{ activo: "true" }], [{}], [{ activo: 1 }]])("body inválido %j → 400", async (body) => {
    const r = await modo.POST(post("/api/demo/modo", body));
    expect(r.status).toBe(400);
    expect(await codigo(r)).toBe("DATOS_INVALIDOS");
  });
});

describe("sin contrato y sin API_MODE=mock", () => {
  it("las rutas v2 responden 503 CONTRATO_NO_CONFIGURADO y nunca una tx falsa", async () => {
    vi.stubEnv("API_MODE", "");
    const respuestas = [
      await rescatesGet.GET(),
      await getPosicion("inversor1"),
      await pedirRescate("inversor1", "10"),
      await liquidar.POST(post("/api/demo/rescates/liquidar", undefined)),
      await modo.POST(post("/api/demo/modo", { activo: true })),
    ];
    for (const r of respuestas) {
      expect(r.status).toBe(503);
      const t = await r.text();
      expect(t).toContain("CONTRATO_NO_CONFIGURADO");
      expect(t).not.toContain("ab".repeat(32));
    }
  });
});
