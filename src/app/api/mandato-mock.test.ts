// Rutas del Mandato en modo mock (API_MODE=mock, sin contrato): bandeja, iniciar, agente, ejecutar, rebote y revocar.
// El scoring corre con las respuestas del BCRA guardadas en shared/fixtures/bcra y el gestor sin modelo: no gasta API ni sale a la red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leerBandeja } from "@/lib/mandato/bandeja";
import { armarInforme } from "@/lib/mandato/informe";
import { firmarEstado } from "@/lib/mandato/estado";
import type { ActivoBandeja, EjecucionMandato, EvaluacionMandato, ResumenFondo, ChequeVista } from "@/shared/types";
import { reiniciarLimites } from "./_lib/acceso";
import { reiniciarMock } from "./_lib/mock";
import { SIN_AUTH, analizarActivo, analizarSoloAnalisis, comoRebote, correrActivos, errorDe, evaluarConEstado, iniciar, json, llamar, rebotar } from "./_lib/pruebas-mandato";
import * as bandejaRuta from "./mandato/bandeja/route";
import * as cheques from "./cheques/route";
import * as fondo from "./fondo/route";

const { activos, mandatoPorDefecto } = leerBandeja();
const porId = (id: string): ActivoBandeja => activos.find((a) => a.id === id)!;
const verFondo = async () => json<ResumenFondo>(await fondo.GET());

beforeEach(() => {
  vi.stubEnv("API_MODE", "mock");
  vi.stubEnv("CHEQUE_FUND_ADDRESS", "");
  vi.stubEnv("DEMO_CLAVE", "clave-de-prueba-0123456789");
  vi.stubEnv("AGENT_MODE", "determinista");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("SCORING_MODE", "real"); // vitest.config lo deja en "mock" (cotización fija): acá se usa el BCRA guardado
  vi.stubEnv("BCRA_MODE", "cache");
  reiniciarLimites();
  reiniciarMock();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/mandato/bandeja", () => {
  it("devuelve los 8 activos y el mandato por defecto", async () => {
    const r = await bandejaRuta.GET();
    expect(r.status).toBe(200);
    const b = await json<{ activos: ActivoBandeja[]; mandatoPorDefecto: unknown }>(r);
    expect(b.activos).toHaveLength(8);
    expect(b.mandatoPorDefecto).toEqual(mandatoPorDefecto);
    expect(b.activos.filter((a) => a.reboteSimulado).map((a) => a.nombre)).toEqual(["Cencosud"]);
  });
});

describe("POST /api/mandato/iniciar", () => {
  it("devuelve un estado firmado con todo el presupuesto disponible", async () => {
    const r = await llamar("iniciar", { mandato: mandatoPorDefecto }, SIN_AUTH);
    expect(r.status).toBe(200);
    const { estado } = await json<{ estado: { invertido: string; disponible: string; firma: string; revocado: boolean; compras: unknown[] } }>(r);
    expect(estado).toMatchObject({ invertido: "0", disponible: "40000000", revocado: false, compras: [] });
    expect(estado.firma).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });
  it.each([
    ["sin cuerpo", undefined],
    ["sin mandato", {}],
    ["presupuesto como número", { mandato: { ...mandatoPorDefecto, presupuesto: 40000000 } }],
    ["plazo de 91 días", { mandato: { ...mandatoPorDefecto, plazoMaxDias: 91 } }],
    ["tipos vacío", { mandato: { ...mandatoPorDefecto, tipos: [] } }],
    ["banda D", { mandato: { ...mandatoPorDefecto, bandaMinima: "D" } }],
  ])("rechaza con 400 un mandato inválido (%s)", async (_n, body) => {
    const r = await llamar("iniciar", body ?? "x", SIN_AUTH);
    expect(r.status).toBe(400);
    expect(["MANDATO_INVALIDO", "DATOS_INVALIDOS"]).toContain((await errorDe(r)).codigo);
  });
});

describe("POST /api/agente/mandato", () => {
  it("transmite los pasos del gestor y termina con el evento `evaluacion` (sin evento `resultado`)", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { eventos, evaluacion } = await analizarActivo(estado, porId("coto-1"));
    expect(eventos.slice(0, -1).every((e) => e.tipo === "paso")).toBe(true);
    expect(eventos.filter((e) => e.tipo === "paso").length).toBeGreaterThan(3);
    expect(eventos.some((e) => (e as { tipo: string }).tipo === "resultado")).toBe(false);
    expect(evaluacion).toMatchObject({ activoId: "coto-1", resultado: "comprar" });
    expect(evaluacion.razones).toHaveLength(11);
    expect(evaluacion.cotizacion.firma).toBeDefined(); // lista para /ejecutar
    expect(evaluacion.cotizacion.tipo).toBe("cheque");
  });
  it("sin `accept: ndjson` responde JSON con la evaluación y los pasos", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const r = await llamar("agente", { estado, activo: porId("telecom-1") }, SIN_AUTH);
    expect(r.status).toBe(200);
    const x = await json<{ evaluacion: { resultado: string }; pasos: unknown[] }>(r);
    expect(x.evaluacion.resultado).toBe("comprar");
    expect(x.pasos.length).toBeGreaterThan(0);
  });
  it("el pagaré con terreno queda fuera por cobertura; el de la turbina y el del camión cumplen", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const terreno = (await analizarActivo(estado, porId("pampa-pagare-terreno"))).evaluacion;
    expect(terreno.resultado).toBe("omitir");
    expect(terreno.razones.filter((r) => !r.cumple).map((r) => r.regla)).toEqual(["cobertura"]);
    expect(terreno.razones.find((r) => r.regla === "cobertura")?.mensaje).toMatch(/75,83 %/);
    for (const id of ["pampa-pagare-turbina", "lomanegra-pagare-camion"]) expect((await analizarActivo(estado, porId(id))).evaluacion.resultado, id).toBe("comprar");
  });
  it("400 ESTADO_INVALIDO sin firma, con firma ajena o con el estado adulterado", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { firma: _f, ...sinFirma } = estado;
    void _f;
    for (const malo of [sinFirma, { ...estado, firma: "1.00" }, { ...estado, disponible: "999999999" }, { ...estado, emisoresBloqueados: ["0xabc"] }, "x", null]) {
      const r = await llamar("agente", { estado: malo, activo: porId("coto-1") }, SIN_AUTH);
      expect(r.status).toBe(400);
      expect((await errorDe(r)).codigo).toBe("ESTADO_INVALIDO");
    }
  });
  it("400 DATOS_INVALIDOS ante un activo mal formado", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    for (const activo of [undefined, {}, { ...porId("coto-1"), cuit: "123" }, { ...porId("coto-1"), nominal: 6000000 }, { ...porId("coto-1"), dias: 0 }, { ...porId("coto-1"), tipo: "letra" }, { ...porId("coto-1"), nominal: "-5" }, { ...porId("coto-1"), id: "con espacios" }]) {
      const r = await llamar("agente", { estado, activo }, SIN_AUTH);
      expect(r.status, JSON.stringify(activo)).toBe(400);
      expect((await errorDe(r)).codigo).toBe("DATOS_INVALIDOS");
    }
  });
  it("409 MANDATO_REVOCADO con el mandato revocado", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { estado: revocado } = await json<{ estado: typeof estado }>(await llamar("revocar", { estado }, SIN_AUTH));
    const r = await llamar("agente", { estado: revocado, activo: porId("coto-1") }, SIN_AUTH);
    expect(r.status).toBe(409);
    expect((await errorDe(r)).codigo).toBe("MANDATO_REVOCADO");
  });
});

describe("POST /api/agente/mandato con soloAnalisis", () => {
  it("el evento final es `analisis` con la cotización firmada, sin evaluar el mandato", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { eventos, cotizacion } = await analizarSoloAnalisis(estado, porId("coto-1"));
    expect(eventos.filter((e) => e.tipo === "paso").length).toBeGreaterThan(3);
    expect(eventos.some((e) => (e as { tipo: string }).tipo === "evaluacion" || (e as { tipo: string }).tipo === "resultado")).toBe(false);
    expect(cotizacion.firma).toBeDefined();
    expect(cotizacion.tipo).toBe("cheque");
  });
  it("sin `accept: ndjson` responde { cotizacion, pasos } y no trae `evaluacion`", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const r = await llamar("agente", { estado, activo: porId("telecom-1"), soloAnalisis: true }, SIN_AUTH);
    expect(r.status).toBe(200);
    const x = await json<Record<string, unknown>>(r);
    expect(Object.keys(x).sort()).toEqual(["cotizacion", "pasos"]);
  });
  it("no depende del estado: con el presupuesto agotado igual devuelve la cotización (lo que depende del estado lo evalúa /evaluar)", async () => {
    const estado = await iniciar({ ...mandatoPorDefecto, presupuesto: "1000" });
    const { cotizacion } = await analizarSoloAnalisis(estado, porId("coto-1"));
    expect(cotizacion.aprobada).toBe(true);
  });
  it("400 si soloAnalisis no es booleano; 409 con el mandato revocado; 400 ESTADO_INVALIDO sin firma", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    expect((await llamar("agente", { estado, activo: porId("coto-1"), soloAnalisis: "si" }, SIN_AUTH)).status).toBe(400);
    const { estado: revocado } = await json<{ estado: typeof estado }>(await llamar("revocar", { estado }, SIN_AUTH));
    expect((await llamar("agente", { estado: revocado, activo: porId("coto-1"), soloAnalisis: true }, SIN_AUTH)).status).toBe(409);
    const { firma: _f, ...sinFirma } = estado;
    void _f;
    const r = await llamar("agente", { estado: sinFirma, activo: porId("coto-1"), soloAnalisis: true }, SIN_AUTH);
    expect((await errorDe(r)).codigo).toBe("ESTADO_INVALIDO");
  });
});

describe("POST /api/mandato/evaluar", () => {
  const ref = (id: string) => ({ id, nombre: porId(id).nombre });
  const evaluar = async (estado: unknown, id: string, cotizacion: Parameters<typeof evaluarConEstado>[1]) => json<{ evaluacion: EvaluacionMandato }>(await evaluarConEstado(estado, cotizacion, ref(id)));

  it("da la misma evaluación que el análisis completo (cumple las 11 reglas con la bandeja) y no pide el acceso de la demo", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    for (const id of ["coto-1", "pampa-pagare-terreno"]) {
      const { cotizacion } = await analizarSoloAnalisis(estado, porId(id));
      const r = await evaluarConEstado(estado, cotizacion, ref(id));
      expect(r.status).toBe(200); // sin clave de la demo
      const { evaluacion } = await json<{ evaluacion: EvaluacionMandato }>(r);
      const completa = (await analizarActivo(estado, porId(id))).evaluacion;
      expect(evaluacion.resultado).toBe(completa.resultado);
      expect(evaluacion.razones).toEqual(completa.razones);
      expect(evaluacion.activoId).toBe(id);
      expect(evaluacion.razones).toHaveLength(11);
    }
  });
  it("evalúa con el estado de AHORA: después de comprar, el tope por emisor ya no deja repetir al mismo emisor", async () => {
    const estado = await iniciar({ ...mandatoPorDefecto, topeEmisorBps: 1500 }); // tope de $ 6 M por emisor: Coto ($ 5,89 M) entra una sola vez
    const { cotizacion } = await analizarSoloAnalisis(estado, porId("coto-1"));
    expect((await evaluar(estado, "coto-1", cotizacion)).evaluacion.resultado).toBe("comprar");
    const c = await correrActivos(estado, [porId("coto-1")]);
    const despues = (await evaluar(c.estado, "coto-1", cotizacion)).evaluacion;
    expect(despues.resultado).toBe("omitir");
    expect(despues.razones.filter((r) => !r.cumple).map((r) => r.regla)).toContain("tope_emisor");
  });
  it("no escribe en la cadena ni toca el fondo", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { cotizacion } = await analizarSoloAnalisis(estado, porId("coto-1"));
    const antes = await verFondo();
    await evaluar(estado, "coto-1", cotizacion);
    expect(await verFondo()).toEqual(antes);
  });
  it("las cifras salen de la cotización firmada: un precio adulterado por el navegador no cambia la evaluación", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { cotizacion } = await analizarSoloAnalisis(estado, porId("coto-1"));
    const honesta = (await evaluar(estado, "coto-1", cotizacion)).evaluacion;
    const adulterada = (await evaluar(estado, "coto-1", { ...cotizacion, precioCompra: "1", aprobada: true, dias: 1 })).evaluacion;
    expect(adulterada.razones).toEqual(honesta.razones);
  });
  it("403 con una cotización que no firmó el servidor", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { cotizacion } = await analizarSoloAnalisis(estado, porId("coto-1"));
    const r = await evaluarConEstado(estado, { ...cotizacion, id: `0x${"7".repeat(64)}`, precioCompra: "1", firma: "9999999999.00" }, ref("coto-1"));
    expect(r.status).toBe(403);
    expect((await errorDe(r)).codigo).toBe("COTIZACION_INVALIDA");
  });
  it("400 ESTADO_INVALIDO con el estado sin firma, ajeno o adulterado", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { cotizacion } = await analizarSoloAnalisis(estado, porId("coto-1"));
    const { firma: _f, ...sinFirma } = estado;
    void _f;
    for (const malo of [sinFirma, { ...estado, firma: "1.00" }, { ...estado, disponible: "999999999" }, { ...estado, emisoresBloqueados: ["0xabc"] }, "x", null]) {
      const r = await evaluarConEstado(malo, cotizacion, ref("coto-1"));
      expect(r.status).toBe(400);
      expect((await errorDe(r)).codigo).toBe("ESTADO_INVALIDO");
    }
  });
  it("409 MANDATO_REVOCADO con el mandato revocado", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { cotizacion } = await analizarSoloAnalisis(estado, porId("coto-1"));
    const { estado: revocado } = await json<{ estado: typeof estado }>(await llamar("revocar", { estado }, SIN_AUTH));
    const r = await evaluarConEstado(revocado, cotizacion, ref("coto-1"));
    expect(r.status).toBe(409);
    expect((await errorDe(r)).codigo).toBe("MANDATO_REVOCADO");
  });
  it("400 DATOS_INVALIDOS con el activo o la cotización mal formados", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { cotizacion } = await analizarSoloAnalisis(estado, porId("coto-1"));
    for (const body of [undefined, { estado, cotizacion }, { estado, cotizacion, activo: {} }, { estado, cotizacion, activo: { id: "con espacios", nombre: "x" } }, { estado, cotizacion, activo: { id: "a", nombre: "" } }, { estado, activo: ref("coto-1") }, { estado, cotizacion: { id: "x" }, activo: ref("coto-1") }]) {
      const r = await llamar("evaluar", body ?? "x", SIN_AUTH);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect((await errorDe(r)).codigo).toBe("DATOS_INVALIDOS");
    }
  });
});

describe("POST /api/mandato/revocar", () => {
  it("devuelve el estado con revocado: true y firma nueva; revocar de nuevo no rompe", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const a = await json<{ estado: typeof estado }>(await llamar("revocar", { estado }, SIN_AUTH));
    expect(a.estado.revocado).toBe(true);
    const b = await llamar("revocar", { estado: a.estado }, SIN_AUTH);
    expect(b.status).toBe(200);
  });
  it("400 ESTADO_INVALIDO con un estado sin firma válida (no se puede 'des-revocar' ni inventar un estado)", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { estado: revocado } = await json<{ estado: typeof estado }>(await llamar("revocar", { estado }, SIN_AUTH));
    for (const malo of [{ ...revocado, revocado: false }, { ...estado, firma: undefined }, undefined]) {
      const r = await llamar("revocar", { estado: malo }, SIN_AUTH);
      expect(r.status).toBe(400);
      expect((await errorDe(r)).codigo).toBe("ESTADO_INVALIDO");
    }
  });
  it("no hace falta el acceso de la demo para revocar", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    expect((await llamar("revocar", { estado }, SIN_AUTH)).status).toBe(200);
  });
});

describe("POST /api/mandato/ejecutar", () => {
  it("exige el acceso de la demo (401 sin clave)", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { evaluacion } = await analizarActivo(estado, porId("coto-1"));
    const r = await llamar("ejecutar", { estado, evaluacion }, SIN_AUTH);
    expect(r.status).toBe(401);
  });
  it("compra lo que cumple: actualiza invertido, disponible, exposición y compras (estado firmado)", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { evaluacion } = await analizarActivo(estado, porId("coto-1"));
    const r = await llamar("ejecutar", { estado, evaluacion });
    expect(r.status).toBe(200);
    const { ejecucion } = await json<{ ejecucion: EjecucionMandato }>(r);
    expect(ejecucion.rechazoContrato).toBeNull();
    expect(ejecucion.compra).toMatchObject({ activoId: "coto-1", nombre: "Coto", estado: "Funded", chequeId: evaluacion.cotizacion.id, precioCompra: evaluacion.cotizacion.precioCompra, nominal: "6000000" });
    expect(ejecucion.estado.invertido).toBe(evaluacion.cotizacion.precioCompra);
    expect(ejecucion.estado.exposicionPorEmisor[evaluacion.cotizacion.libradorHash.toLowerCase()]).toBe(evaluacion.cotizacion.precioCompra);
    expect(ejecucion.estado.compras).toHaveLength(1);
    expect(ejecucion.estado.firma).toBeDefined();
    // el estado nuevo vale como entrada de la próxima llamada
    expect((await llamar("agente", { estado: ejecucion.estado, activo: porId("telecom-1") }, SIN_AUTH)).status).toBe(200);
  });
  it("no compra lo que el mandato dice que no, aunque el navegador diga `comprar`: 409 FUERA_DE_MANDATO", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { evaluacion } = await analizarActivo(estado, porId("pampa-pagare-terreno"));
    expect(evaluacion.resultado).toBe("omitir");
    const r = await llamar("ejecutar", { estado, evaluacion: { ...evaluacion, resultado: "comprar" } });
    expect(r.status).toBe(409);
    expect((await errorDe(r)).codigo).toBe("FUERA_DE_MANDATO");
    expect((await verFondo()).cantidadCheques.Funded).toBe(4); // el fondo de ejemplo no cambió
  });
  it("una cotización que no firmó el servidor no se acepta (403)", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { evaluacion } = await analizarActivo(estado, porId("coto-1"));
    const inventada = { ...evaluacion, cotizacion: { ...evaluacion.cotizacion, id: `0x${"7".repeat(64)}`, precioCompra: "1", firma: "9999999999.00" } };
    const r = await llamar("ejecutar", { estado, evaluacion: inventada });
    expect(r.status).toBe(403);
    expect((await errorDe(r)).codigo).toBe("COTIZACION_INVALIDA");
  });
  it("400 ESTADO_INVALIDO con el estado adulterado (por ejemplo, un presupuesto más grande)", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { evaluacion } = await analizarActivo(estado, porId("coto-1"));
    const r = await llamar("ejecutar", { estado: { ...estado, mandato: { ...estado.mandato, presupuesto: "100000000" }, disponible: "100000000" }, evaluacion });
    expect(r.status).toBe(400);
    expect((await errorDe(r)).codigo).toBe("ESTADO_INVALIDO");
  });
  it("409 MANDATO_REVOCADO con el mandato revocado", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    const { evaluacion } = await analizarActivo(estado, porId("coto-1"));
    const { estado: revocado } = await json<{ estado: typeof estado }>(await llamar("revocar", { estado }, SIN_AUTH));
    const r = await llamar("ejecutar", { estado: revocado, evaluacion });
    expect(r.status).toBe(409);
    expect((await errorDe(r)).codigo).toBe("MANDATO_REVOCADO");
  });
  it("el mismo activo no se compra dos veces (409 ACTIVO_YA_COMPRADO)", async () => {
    const c = await correrActivos(await iniciar(mandatoPorDefecto), [porId("coto-1")]);
    const r = await llamar("ejecutar", { estado: c.estado, evaluacion: c.evaluaciones[0] });
    expect(r.status).toBe(409);
    expect((await errorDe(r)).codigo).toBe("ACTIVO_YA_COMPRADO");
  });
  it("datos mal formados: 400", async () => {
    const estado = await iniciar(mandatoPorDefecto);
    for (const evaluacion of [undefined, {}, { activoId: "x" }, { activoId: "x", cotizacion: { id: "no-es-hex" } }]) {
      const r = await llamar("ejecutar", { estado, evaluacion });
      expect(r.status, JSON.stringify(evaluacion)).toBe(400);
      expect((await errorDe(r)).codigo).toBe("DATOS_INVALIDOS");
    }
  });
  it("con aprobacionSobre: queda pendiente y solo se ejecuta con `aprobado: true`", async () => {
    const estado = await iniciar({ ...mandatoPorDefecto, aprobacionSobre: "5000000" });
    const { evaluacion } = await analizarActivo(estado, porId("mercadolibre-1")); // nominal 9 M > 5 M
    expect(evaluacion.resultado).toBe("pendiente_aprobacion");
    const sin = await llamar("ejecutar", { estado, evaluacion });
    expect(sin.status).toBe(409);
    expect((await errorDe(sin)).codigo).toBe("APROBACION_PENDIENTE");
    expect((await llamar("ejecutar", { estado, evaluacion, aprobado: "si" })).status).toBe(400);
    const con = await llamar("ejecutar", { estado, evaluacion, aprobado: true });
    expect(con.status).toBe(200);
    expect((await json<{ ejecucion: EjecucionMandato }>(con)).ejecucion.compra?.activoId).toBe("mercadolibre-1");
    // `aprobado: true` no salva a un activo que incumple otra regla
    const fuera = (await analizarActivo(estado, porId("pampa-pagare-terreno"))).evaluacion;
    expect((await llamar("ejecutar", { estado, evaluacion: fuera, aprobado: true })).status).toBe(409);
  });
});

describe("la bandeja completa en mock", () => {
  it("compra los esperados, el contrato rechaza el 2.º de MercadoLibre (10 % del patrimonio) y el 8 se omite por cobertura", async () => {
    const c = await correrActivos(await iniciar(mandatoPorDefecto), activos);
    const resultado = Object.fromEntries(c.evaluaciones.map((e) => [e.activoId, e.resultado]));
    expect(resultado).toEqual({
      "mercadolibre-1": "comprar",
      "mercadolibre-2": "comprar", // el mandato lo deja pasar...
      "coto-1": "comprar",
      "cencosud-1": "comprar",
      "pampa-pagare-turbina": "comprar",
      "lomanegra-pagare-camion": "comprar",
      "telecom-1": "comprar",
      "pampa-pagare-terreno": "omitir",
    });
    const rechazada = c.ejecuciones.find((x) => x.rechazoContrato);
    expect(rechazada?.activoId).toBe("mercadolibre-2"); // ...y lo frena el contrato
    expect(rechazada?.rechazoContrato?.codigo).toBe("CONCENTRACION_EXCEDIDA");
    expect(rechazada?.rechazoContrato?.mensaje).toMatch(/tope permitido/);
    expect(rechazada?.compra).toBeNull();
    expect(c.estado.compras.map((x) => x.activoId)).toEqual(["mercadolibre-1", "coto-1", "cencosud-1", "pampa-pagare-turbina", "lomanegra-pagare-camion", "telecom-1"]);
    expect(c.estado.compras.every((x) => x.estado === "Funded")).toBe(true);
    const suma = c.estado.compras.reduce((s, x) => s + Math.round(Number(x.precioCompra) * 100), 0);
    expect(Math.round(Number(c.estado.invertido) * 100)).toBe(suma);
    expect(Number(c.estado.invertido) + Number(c.estado.disponible)).toBeCloseTo(40_000_000, 2);
    // el fondo de ejemplo refleja las compras
    const f = await verFondo();
    expect(f.cantidadCheques.Funded).toBe(4 + 6);
    const lista = await json<ChequeVista[]>(await cheques.GET());
    expect(lista.slice(0, 6).every((x) => x.estado === "Funded")).toBe(true);
    expect(f.liquidezBps).toBeGreaterThanOrEqual(f.politica.liquidezMinBps);
  });

  it("el rebote de Cencosud baja lo invertido, bloquea al emisor, baja el patrimonio del fondo y deja de comprarle", async () => {
    const c = await correrActivos(await iniciar(mandatoPorDefecto), activos);
    const antes = await verFondo();
    const cenco = c.estado.compras.find((x) => x.activoId === "cencosud-1")!;
    const r = await rebotar(c.estado, cenco.chequeId, c.evaluaciones);
    expect(r.status).toBe(200);
    const rebote = await comoRebote(r);
    expect(rebote.perdida).toBe(cenco.precioCompra);
    expect(rebote.emisorBloqueado).toBe("Cencosud");
    expect(rebote.estado.emisoresBloqueados).toEqual([cenco.libradorHash.toLowerCase()]);
    expect(rebote.estado.compras.find((x) => x.activoId === "cencosud-1")?.estado).toBe("Rejected");
    expect(Number(rebote.estado.invertido)).toBeCloseTo(Number(c.estado.invertido) - Number(cenco.precioCompra), 2);
    expect(rebote.explicacion).toMatch(/^Rebote simulado por el oráculo de la demo/);
    expect(rebote.explicacion).toContain("Cencosud");
    expect(rebote.explicacion).not.toMatch(/rinde|rendimiento|\bIA\b/i);
    expect(rebote.tx).toMatch(/^0x/);
    expect(rebote.replanificar).toEqual([]); // con el presupuesto de la demo nada quedó afuera por plata
    // efecto en el fondo
    const despues = await verFondo();
    expect(Number(despues.totalAssets)).toBeCloseTo(Number(antes.totalAssets) - Number(cenco.precioCompra), 2);
    expect(despues.cantidadCheques.Rejected).toBe(antes.cantidadCheques.Rejected + 1);
    expect(Number(despues.rechazos.perdida)).toBeCloseTo(Number(antes.rechazos.perdida) + Number(cenco.precioCompra), 2);
    expect(Number(despues.valorCuotaparte)).toBeLessThan(Number(antes.valorCuotaparte));
    // ya no se le compra a Cencosud
    const otra = await analizarActivo(rebote.estado, { ...porId("cencosud-1"), id: "cencosud-2" });
    expect(otra.evaluacion.resultado).toBe("omitir");
    expect(otra.evaluacion.razones.filter((x) => !x.cumple).map((x) => x.regla)).toContain("emisor_bloqueado");
    // el informe con lo que pasó
    const informe = armarInforme({ estado: rebote.estado, evaluaciones: c.evaluaciones, ejecuciones: c.ejecuciones, rebotes: [rebote], antes, despues, activos });
    expect(informe.comprados).toHaveLength(6);
    expect(informe.omitidos.map((o) => o.activoId)).toEqual(["pampa-pagare-terreno"]);
    expect(informe.rechazadosPorContrato.map((o) => [o.activoId, o.codigo])).toEqual([["mercadolibre-2", "CONCENTRACION_EXCEDIDA"]]);
    expect(informe.rebotes).toEqual([{ chequeId: cenco.chequeId, nombre: "Cencosud", perdida: cenco.precioCompra }]);
    expect(informe.emisoresBloqueados).toEqual(["Cencosud"]);
  });

  it("replanifica lo que había quedado afuera por presupuesto y ahora entra", async () => {
    // $ 20 M de presupuesto y sin tope por emisor: Pampa, Loma Negra y Telecom quedan afuera por presupuesto
    const c = await correrActivos(await iniciar({ ...mandatoPorDefecto, presupuesto: "20000000", topeEmisorBps: 10000 }), activos);
    const sinPlata = c.evaluaciones.filter((e) => e.razones.some((r) => r.regla === "presupuesto" && !r.cumple)).map((e) => e.activoId);
    expect(sinPlata).toEqual(expect.arrayContaining(["pampa-pagare-turbina", "lomanegra-pagare-camion", "telecom-1"]));
    const cenco = c.estado.compras.find((x) => x.activoId === "cencosud-1")!;
    const rebote = await comoRebote(await rebotar(c.estado, cenco.chequeId, c.evaluaciones));
    // al bajar lo invertido entra Telecom (~$ 2,8 M); Loma Negra (~$ 5,76 M) y Pampa (~$ 7,5 M) todavía no caben
    expect(rebote.replanificar).toEqual(["telecom-1"]);
    expect(rebote.explicacion).toContain("Telecom");
    const nueva = await correrActivos(rebote.estado, [porId("telecom-1")]);
    expect(nueva.estado.compras.map((x) => x.activoId)).toContain("telecom-1");
  });

  it("rebote: exige el acceso de la demo, estado válido y una compra del mandato que siga fondeada", async () => {
    const c = await correrActivos(await iniciar(mandatoPorDefecto), [porId("cencosud-1")]);
    const id = c.estado.compras[0].chequeId;
    expect((await llamar("rebote", { estado: c.estado, chequeId: id }, SIN_AUTH)).status).toBe(401);
    const adulterado = await llamar("rebote", { estado: { ...c.estado, invertido: "0" }, chequeId: id });
    expect(adulterado.status).toBe(400);
    expect((await errorDe(adulterado)).codigo).toBe("ESTADO_INVALIDO");
    expect((await llamar("rebote", { estado: c.estado, chequeId: "xx" })).status).toBe(400);
    const ajeno = await llamar("rebote", { estado: c.estado, chequeId: `0x${"9".repeat(64)}` });
    expect(ajeno.status).toBe(404);
    expect((await errorDe(ajeno)).codigo).toBe("COMPRA_INEXISTENTE");
    expect((await llamar("rebote", { estado: c.estado, chequeId: id, evaluaciones: "no" })).status).toBe(400);
    const ok = await comoRebote(await rebotar(c.estado, id));
    const dos = await rebotar(ok.estado, id); // ya rebotó
    expect(dos.status).toBe(409);
    expect((await errorDe(dos)).codigo).toBe("COMPRA_NO_FONDEADA");
  });

  it("el rebote sigue andando con el mandato revocado (es monitoreo, no una compra)", async () => {
    const c = await correrActivos(await iniciar(mandatoPorDefecto), [porId("cencosud-1")]);
    const revocado = firmarEstado({ ...c.estado, revocado: true });
    expect((await rebotar(revocado, c.estado.compras[0].chequeId)).status).toBe(200);
  });
});
