// El Mandato contra el contrato v2 REAL (anvil, deploy del script real, `forge script`): la bandeja completa por las rutas de la API.
// Partida: `preparar-demo --solo-pool` (solo los dos inversores, $ 100.000.000, sin cheques). Nada toca una red real.
// Se saltea solo si falta anvil, forge o el contrato compilado (`cd contracts && forge build`).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reiniciarLimites } from "@/app/api/_lib/acceso";
import { AUTH, analizarActivo, analizarSoloAnalisis, comoRebote, errorDe, evaluarConEstado, iniciar, json, llamar, rebotar, type Corrida } from "@/app/api/_lib/pruebas-mandato";
import { CONCURRENCIA_ANALISIS } from "@/lib/mandato-ui";
import { AHORA_FIJO_MS, CLAVE_DEMO, arrancarCadena, entornoDeApi, hayEntornoDeCadena, type Cadena } from "@/lib/chain/testanvil";
import { prepararDemo } from "../../../scripts/preparar-demo.mjs";
import type { ActivoBandeja, ChequeVista, Cotizacion, EjecucionMandato, EstadoMandato, EvaluacionMandato, ResumenFondo } from "@/shared/types";
import { armarInforme } from "./informe";
import { leerBandeja } from "./bandeja";

const ENV_ORIGINAL = { ...process.env };
let cadena: Cadena | undefined;
const fixtures = JSON.parse(readFileSync(new URL("../../../shared/fixtures/cheques-demo.json", import.meta.url), "utf8"));
const { activos, mandatoPorDefecto } = leerBandeja();
const porId = (id: string): ActivoBandeja => activos.find((a) => a.id === id)!;

/** `fetch` que en vez de salir a la red llama a los Route Handlers de Next. */
async function fetchALasRutas(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(url));
  const modulo = await import(`@/app${u.pathname}/route`);
  return (modulo[(init?.method ?? "GET").toUpperCase()] as (r: Request) => Promise<Response>)(new Request(u, init));
}
const verFondo = async () => json<ResumenFondo>(await fetchALasRutas("http://demo/api/fondo"));
const verCheques = async () => json<ChequeVista[]>(await fetchALasRutas("http://demo/api/cheques"));
const num = (s: string) => Number(s);

/**
 * Corre la bandeja como la pantalla: los primeros `CONCURRENCIA_ANALISIS` activos se analizan en paralelo con el estado inicial (antes de
 * comprar nada); después, en el orden de la bandeja, se evalúa el mandato con el estado vigente y, si da `comprar`, se ejecuta. Los demás
 * se analizan cuando les toca, ya con las compras anteriores en la cartera (la lectura de la cartera es la de ese momento).
 */
async function correrComoLaPantalla(estadoInicial: EstadoMandato, lista: ActivoBandeja[]): Promise<Corrida> {
  const c: Corrida = { estado: estadoInicial, evaluaciones: [], ejecuciones: [] };
  const previos = new Map<string, Promise<Cotizacion>>();
  for (const a of lista.slice(0, CONCURRENCIA_ANALISIS)) previos.set(a.id, analizarSoloAnalisis(estadoInicial, a).then((r) => r.cotizacion));
  for (const activo of lista) {
    const cotizacion = await (previos.get(activo.id) ?? analizarSoloAnalisis(c.estado, activo).then((r) => r.cotizacion));
    const re = await evaluarConEstado(c.estado, cotizacion, { id: activo.id, nombre: activo.nombre });
    if (re.status !== 200) throw new Error(`evaluar ${activo.id} → ${re.status}: ${JSON.stringify(await re.json())}`);
    const { evaluacion } = await json<{ evaluacion: EvaluacionMandato }>(re);
    c.evaluaciones.push(evaluacion);
    if (evaluacion.resultado !== "comprar") continue;
    const r = await llamar("ejecutar", { estado: c.estado, evaluacion });
    if (r.status !== 200) throw new Error(`ejecutar ${activo.id} → ${r.status}: ${JSON.stringify(await r.json())}`);
    const { ejecucion } = await json<{ ejecucion: EjecucionMandato }>(r);
    c.ejecuciones.push(ejecucion);
    c.estado = ejecucion.estado;
  }
  return c;
}

describe.skipIf(!hayEntornoDeCadena)("mandato contra el contrato v2 real (anvil)", () => {
  vi.setConfig({ testTimeout: 240_000, hookTimeout: 180_000 });

  let corrida: Corrida;
  let antes: ResumenFondo;

  beforeAll(async () => {
    vi.useFakeTimers({ now: AHORA_FIJO_MS, toFake: ["Date"], shouldAdvanceTime: true });
    cadena = await arrancarCadena();
    Object.assign(process.env, entornoDeApi(cadena));
    reiniciarLimites();
    const resumen = await prepararDemo({ base: "http://demo", fixtures, fetchFn: fetchALasRutas as typeof fetch, log: () => {}, hoy: new Date(AHORA_FIJO_MS), clave: CLAVE_DEMO, soloPool: true });
    expect(resumen).toEqual([]);
    antes = await verFondo();
  });

  afterAll(() => {
    vi.useRealTimers();
    cadena?.parar();
    for (const k of Object.keys(process.env)) if (!(k in ENV_ORIGINAL)) delete process.env[k];
    Object.assign(process.env, ENV_ORIGINAL);
  });

  it("--solo-pool dejó el fondo con ~$ 100.000.000, todo líquido y sin ningún cheque", () => {
    expect(num(antes.totalAssets)).toBeGreaterThan(99_999_000);
    expect(num(antes.totalAssets)).toBeLessThanOrEqual(100_000_000);
    expect(antes.cantidadCheques).toEqual({ Pending: 0, Funded: 0, Paid: 0, Rejected: 0 });
    expect(antes.liquidezBps).toBe(10_000);
  });

  it("corre la bandeja: se compran los esperados, el servidor rechaza el 2.º de MercadoLibre (10 %) antes de la tx y el 8 se omite por cobertura", async () => {
    corrida = await correrComoLaPantalla(await iniciar(mandatoPorDefecto), activos);
    const resultado = Object.fromEntries(corrida.evaluaciones.map((e) => [e.activoId, e.resultado]));
    expect(resultado).toEqual({
      "mercadolibre-1": "comprar",
      "mercadolibre-2": "comprar", // el mandato lo deja pasar (12,5 M ≤ tope de $ 14 M)...
      "coto-1": "comprar",
      "cencosud-1": "comprar",
      "pampa-pagare-turbina": "comprar",
      "lomanegra-pagare-camion": "comprar",
      "telecom-1": "comprar",
      "pampa-pagare-terreno": "omitir", // cobertura 75,83 % < 100 %
    });
    const terreno = corrida.evaluaciones.find((e) => e.activoId === "pampa-pagare-terreno")!;
    // Además de la cobertura, ahora el gestor lo rechaza por el límite del fondo: Pampa ya tiene la turbina y con el terreno pasaría el 10 % (se analiza con las compras anteriores en la cartera)
    const fallas = terreno.razones.filter((r) => !r.cumple);
    expect(fallas.map((r) => r.regla)).toEqual(["cotizacion", "gestor", "cobertura", "tope_emisor", "presupuesto"]);
    expect(fallas[0].mensaje).toMatch(/El emisor quedaría en 10,26 % del fondo, por encima del tope de 10 %/);

    // ...y lo frena el servidor antes de mandar la tx (el contrato diría lo mismo): el segundo MercadoLibre dejaría al emisor en el 12,5 % del patrimonio (tope 10 %)
    const rechazadas = corrida.ejecuciones.filter((x) => x.rechazoContrato);
    expect(rechazadas.map((x) => [x.activoId, x.rechazoContrato?.codigo])).toEqual([["mercadolibre-2", "CONCENTRACION_EXCEDIDA"]]);
    expect(rechazadas[0].rechazoContrato?.mensaje).toMatch(/^No registramos este activo: .*el tope permitido es \$ (9\.999\.999|10\.000\.000)/);
    expect(rechazadas[0].compra).toBeNull();

    expect(corrida.estado.compras.map((c) => c.activoId)).toEqual(["mercadolibre-1", "coto-1", "cencosud-1", "pampa-pagare-turbina", "lomanegra-pagare-camion", "telecom-1"]);
    expect(corrida.estado.compras.every((c) => c.estado === "Funded" && /^0x[0-9a-f]{64}$/.test(c.tx))).toBe(true);
    expect(num(corrida.estado.invertido) + num(corrida.estado.disponible)).toBeCloseTo(40_000_000, 2);

    // lo que dice la cadena: 6 Funded y el segundo MercadoLibre ni siquiera quedó registrado (ya no queda Pending)
    const f = await verFondo();
    expect(f.cantidadCheques).toMatchObject({ Funded: 6, Pending: 0, Rejected: 0 });
    expect(num(f.enCheques)).toBeCloseTo(num(corrida.estado.invertido), 2); // el estado del mandato coincide con la cartera
    expect(f.liquidezBps).toBeGreaterThanOrEqual(f.politica.liquidezMinBps);
    for (const p of f.composicion.porEmisor) expect((num(p.monto) / num(f.totalAssets)) * 10_000).toBeLessThanOrEqual(1000);
    const cheques = await verCheques();
    expect(cheques.filter((c) => c.estado === "Pending")).toHaveLength(0);
  });

  it("el estado firmado no se puede adulterar contra la cadena real, y un activo ya comprado no se compra de nuevo", async () => {
    const e = corrida.evaluaciones.find((x) => x.activoId === "coto-1")!;
    const r = await llamar("ejecutar", { estado: { ...corrida.estado, disponible: "99999999" }, evaluacion: e });
    expect(r.status).toBe(400);
    expect((await errorDe(r)).codigo).toBe("ESTADO_INVALIDO");
    const otra = await llamar("ejecutar", { estado: corrida.estado, evaluacion: e }, AUTH);
    expect(otra.status).toBe(409);
    expect((await errorDe(otra)).codigo).toBe("ACTIVO_YA_COMPRADO");
  });

  it("el rebote de Cencosud: el oráculo lo marca Rejected, baja `invertido`, bloquea al emisor y baja el patrimonio en la pérdida", async () => {
    const fondoAntes = await verFondo();
    const cenco = corrida.estado.compras.find((c) => c.activoId === "cencosud-1")!;
    reiniciarLimites();
    const r = await rebotar(corrida.estado, cenco.chequeId, corrida.evaluaciones);
    expect(r.status).toBe(200);
    const rebote = await comoRebote(r);

    expect(rebote.perdida).toBe(cenco.precioCompra); // leída de la cadena: lo que el fondo había pagado
    expect(rebote.emisorBloqueado).toBe("Cencosud");
    expect(rebote.estado.emisoresBloqueados).toEqual([cenco.libradorHash.toLowerCase()]);
    expect(rebote.estado.compras.find((c) => c.activoId === "cencosud-1")?.estado).toBe("Rejected");
    expect(num(rebote.estado.invertido)).toBeCloseTo(num(corrida.estado.invertido) - num(cenco.precioCompra), 2);
    expect(rebote.tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(rebote.explicacion).toMatch(/^Rebote simulado/);
    expect(rebote.replanificar).toEqual([]);

    const cheques = await verCheques();
    expect(cheques.find((c) => c.id.toLowerCase() === cenco.chequeId.toLowerCase())?.estado).toBe("Rejected");
    expect(cheques.find((c) => c.id.toLowerCase() === cenco.chequeId.toLowerCase())?.txs.map((t) => t.tipo)).toContain("rechazado");
    const fondoDespues = await verFondo();
    expect(fondoDespues.cantidadCheques).toMatchObject({ Funded: 5, Rejected: 1 });
    expect(num(fondoDespues.rechazos.perdida)).toBeCloseTo(num(cenco.precioCompra), 2);
    expect(num(fondoDespues.totalAssets)).toBeCloseTo(num(fondoAntes.totalAssets) - num(cenco.precioCompra), 2);
    expect(num(fondoDespues.enCheques)).toBeCloseTo(num(rebote.estado.invertido), 2);

    // ya no se le compra a Cencosud (otro activo del mismo emisor)
    const otro = await analizarActivo(rebote.estado, { ...porId("cencosud-1"), id: "cencosud-2" });
    expect(otro.evaluacion.resultado).toBe("omitir");
    expect(otro.evaluacion.razones.filter((x) => !x.cumple).map((x) => x.regla)).toContain("emisor_bloqueado");

    // un segundo rebote del mismo cheque no se puede
    expect((await errorDe(await rebotar(rebote.estado, cenco.chequeId))).codigo).toBe("COMPRA_NO_FONDEADA");

    // el informe cierra con los números de la cadena
    const informe = armarInforme({ estado: rebote.estado, evaluaciones: corrida.evaluaciones, ejecuciones: corrida.ejecuciones, rebotes: [rebote], antes, despues: fondoDespues, activos });
    expect(informe.comprados).toHaveLength(6);
    expect(informe.omitidos.map((o) => o.activoId)).toEqual(["pampa-pagare-terreno"]);
    expect(informe.rechazadosPorContrato.map((o) => o.activoId)).toEqual(["mercadolibre-2"]);
    expect(informe.rebotes).toHaveLength(1);
    expect(informe.antes.patrimonio).toBe(antes.totalAssets);
    expect(num(informe.despues.patrimonio)).toBeLessThan(num(informe.antes.patrimonio));
  });
});
