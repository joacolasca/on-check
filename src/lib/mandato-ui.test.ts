// Tests de la corrida del mandato contra un backend falso (se inyecta el fetch: se prueban cliente y orquestador juntos).
import { describe, expect, it } from "vitest";
import type { ActivoBandeja, CompraMandato, Cotizacion, EstadoMandato, EvaluacionMandato, Mandato, ResumenFondo } from "@/shared/types";
import { sumarDecimales } from "./format";
import { crearClienteMandato, parsearEventoMandato } from "./mandato-client";
import {
  CorridaMandato,
  activoSorpresa,
  armarInforme,
  contadores,
  mandatoDesdeValores,
  porcentajeABps,
  resumenCopiable,
  valoresDesdeMandato,
  type SnapshotCorrida,
} from "./mandato-ui";

const MANDATO: Mandato = { presupuesto: "40000000", bandaMinima: "B", topeEmisorBps: 1500, plazoMaxDias: 90, tipos: ["cheque", "pagare"], coberturaMinBps: 10000, aprobacionSobre: null };

const act = (id: string, nombre: string, nominal: string, extra: Partial<ActivoBandeja> = {}): ActivoBandeja => ({ id, cuit: "30700000000", nombre, tipo: "cheque", nominal, dias: 60, ...extra });
const ACTIVOS = [
  act("a1", "MercadoLibre", "9000000"),
  act("a2", "MercadoLibre bis", "4000000"), // el contrato lo rechaza
  act("a3", "Pampa Energía", "3000000"), // fuera de mandato
  act("a4", "Cencosud", "5000000", { reboteSimulado: true }),
  act("a5", "Telecom", "3000000"), // omitido por presupuesto hasta que el rebote libera plata
];

interface Llamada { ruta: string; cuerpo: Record<string, unknown>; signal?: AbortSignal | null }

function backendFalso(opts: { aprobacionSobre?: string | null; accesoOk?: boolean } = {}) {
  const llamadas: Llamada[] = [];
  const compuertas = new Map<string, Promise<void>>(); // "ruta:activoId" → espera antes de responder
  let accesoOk = opts.accesoOk ?? true;
  const fallas = new Map<string, number>(); // "ruta:activoId" → status HTTP (siempre)
  const fallasUnaVez = new Map<string, number>(); // "ruta:activoId" → status HTTP (solo la primera llamada)
  let reboteHecho = false;
  let firmas = 0;

  const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });
  const error = (status: number, codigo: string, mensaje: string) => json({ error: { codigo, mensaje } }, status);
  const firmar = (e: EstadoMandato): EstadoMandato => ({ ...e, firma: `f${++firmas}` });

  function evaluar(activoId: string, estado: EstadoMandato): EvaluacionMandato {
    const omitir = activoId === "a3" || (activoId === "a5" && !reboteHecho);
    const grande = opts.aprobacionSobre != null && activoId === "a1";
    return {
      activoId,
      resultado: omitir ? "omitir" : grande ? "pendiente_aprobacion" : "comprar",
      razones: [
        { regla: "tipo", cumple: true, mensaje: "Es un cheque." },
        { regla: "presupuesto", cumple: activoId !== "a5" || reboteHecho, mensaje: "Presupuesto." },
        { regla: "cobertura", cumple: activoId !== "a3", mensaje: "Cobertura." },
      ],
      cotizacion: { precioCompra: "1000000", libradorHash: `0x${activoId}` } as unknown as Cotizacion,
      resumen: `eval ${activoId} con ${estado.invertido}`,
    };
  }

  async function fetchFalso(ruta: string, init?: RequestInit): Promise<Response> {
    const cuerpo = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    llamadas.push({ ruta, cuerpo, signal: init?.signal });
    const estado = cuerpo.estado as EstadoMandato | undefined;
    const activoId = ((cuerpo.activo as ActivoBandeja | undefined)?.id ?? (cuerpo.evaluacion as EvaluacionMandato | undefined)?.activoId ?? "") as string;
    const clave = `${ruta}:${activoId}`;
    await compuertas.get(clave);
    const unaVez = fallasUnaVez.get(clave);
    if (unaVez) {
      fallasUnaVez.delete(clave);
      return error(unaVez, "BOOM", "Falló la llamada.");
    }
    const status = fallas.get(clave);
    if (status) return error(status, "BOOM", "Falló la llamada.");

    if (ruta === "/api/fondo") {
      const n = llamadas.filter((l) => l.ruta === "/api/fondo").length;
      return json({ totalAssets: n === 1 ? "100000000" : "100450000", liquidezBps: n === 1 ? 4100 : 2300, valorCuotaparte: n === 1 ? "1004.82" : "1006.10" } as unknown as ResumenFondo);
    }
    if (ruta === "/api/mandato/iniciar") {
      const m = cuerpo.mandato as Mandato;
      return json({ estado: firmar({ mandato: m, invertido: "0", disponible: m.presupuesto, exposicionPorEmisor: {}, emisoresBloqueados: [], compras: [], revocado: false, creadoEn: "2026-11-07T12:00:00Z" }) });
    }
    if (!estado?.firma) return error(400, "ESTADO_INVALIDO", "Estado sin firma.");

    if (ruta === "/api/agente/mandato") {
      // soloAnalisis: la cotización firmada, sin evaluar el mandato (el estado de este momento puede quedar viejo)
      expect(cuerpo.soloAnalisis).toBe(true);
      const lineas = [
        { tipo: "paso", paso: { n: 1, tipo: "herramienta", titulo: "Consulto el BCRA", detalle: "ok", herramienta: "consultar_bcra" } },
        { tipo: "paso", paso: { n: 2, tipo: "conclusion", titulo: "Listo", detalle: "" } },
        { tipo: "analisis", cotizacion: { id: `0xcot-${activoId}`, precioCompra: "1000000", libradorHash: `0x${activoId}` } },
      ];
      return new Response(lineas.map((l) => JSON.stringify(l)).join("\n") + "\n", { headers: { "content-type": "application/x-ndjson" } });
    }
    if (ruta === "/api/mandato/evaluar") {
      expect((cuerpo.cotizacion as { id: string }).id).toBe(`0xcot-${activoId}`);
      return json({ evaluacion: evaluar(activoId, estado) });
    }
    if (!accesoOk) return error(401, "NO_AUTORIZADO", "Falta la clave de la demo.");

    if (ruta === "/api/mandato/ejecutar") {
      if (activoId === "a2") return json({ ejecucion: { activoId, estado, compra: null, rechazoContrato: { codigo: "CONCENTRACION_EXCEDIDA", mensaje: "Supera el 10 %." } } });
      const ev = cuerpo.evaluacion as EvaluacionMandato;
      if (ev.resultado === "pendiente_aprobacion" && cuerpo.aprobado !== true) return error(409, "SIN_APROBACION", "Falta aprobar.");
      const compra: CompraMandato = { activoId, nombre: activoId, libradorHash: `0x${activoId}`, chequeId: `0xcheque-${activoId}`, nominal: "1", precioCompra: "1000000", tx: `0xtx${activoId}`, estado: "Funded" };
      const nuevo = firmar({ ...estado, invertido: sumarDecimales(estado.invertido, "1000000"), disponible: "0", compras: [...estado.compras, compra] });
      return json({ ejecucion: { activoId, estado: nuevo, compra, rechazoContrato: null } });
    }
    if (ruta === "/api/mandato/rebote") {
      reboteHecho = true;
      const compras = estado.compras.map((c) => (c.chequeId === cuerpo.chequeId ? { ...c, estado: "Rejected" as const } : c));
      return json({ estado: firmar({ ...estado, compras, emisoresBloqueados: ["0xa4"] }), chequeId: cuerpo.chequeId, perdida: "1000000", emisorBloqueado: "Cencosud", replanificar: ["a5"], explicacion: "Rebotó (simulado).", tx: "0xtxrebote" });
    }
    if (ruta === "/api/mandato/revocar") return json({ estado: firmar({ ...estado, revocado: true }) });
    return error(404, "NO_ENCONTRADO", ruta);
  }

  return {
    fetch: fetchFalso,
    llamadas,
    compuerta(ruta: string, activoId: string) {
      let abrir!: () => void;
      compuertas.set(`${ruta}:${activoId}`, new Promise<void>((r) => (abrir = r)));
      return abrir;
    },
    setAcceso: (v: boolean) => { accesoOk = v; },
    fallar: (ruta: string, activoId: string, status = 500) => fallas.set(`${ruta}:${activoId}`, status),
    fallarUnaVez: (ruta: string, activoId: string, status = 500) => fallasUnaVez.set(`${ruta}:${activoId}`, status),
    cuantas: (ruta: string, activoId?: string) => llamadas.filter((l) => l.ruta === ruta && (activoId === undefined || ((l.cuerpo.activo as ActivoBandeja | undefined)?.id ?? (l.cuerpo.evaluacion as EvaluacionMandato | undefined)?.activoId) === activoId)).length,
  };
}

function esperar(c: CorridaMandato, cond: (s: SnapshotCorrida) => boolean): Promise<SnapshotCorrida> {
  return new Promise((resolver) => {
    if (cond(c.getSnapshot())) return resolver(c.getSnapshot());
    const baja = c.subscribe(() => {
      if (cond(c.getSnapshot())) {
        baja();
        resolver(c.getSnapshot());
      }
    });
  });
}

const nuevaCorrida = (b: ReturnType<typeof backendFalso>) => new CorridaMandato(crearClienteMandato(b.fetch));
const resultados = (s: SnapshotCorrida) => s.items.map((i) => `${i.id}:${i.resultado}`);

describe("corrida completa", () => {
  it("compra, omite, el contrato rechaza, rebota y replanifica", async () => {
    const b = backendFalso();
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: true });
    const s = await esperar(c, (x) => x.fase === "terminada");

    expect(resultados(s)).toEqual(["a1:compro", "a2:contrato_no", "a3:omitio", "a4:compro", "a5:omitio", "a5#re1:compro"]);
    expect(s.rebotes).toHaveLength(1);
    expect(s.rebotes[0].nombre).toBe("a4");
    expect(s.items[5].reevaluacion).toBe(true);
    expect(s.items[0].pasos).toHaveLength(2);
    expect(s.estado?.compras.map((x) => `${x.activoId}:${x.estado}`)).toEqual(["a1:Funded", "a4:Rejected", "a5:Funded"]);
    expect(s.estado?.emisoresBloqueados).toEqual(["0xa4"]);
    // contadores por activo: la reevaluación reemplaza a la omisión
    expect(contadores(s.items)).toMatchObject({ total: 5, comprados: 3, omitidos: 1, rechazados: 1, errores: 0, procesados: 5 });
    // foto del fondo antes y después
    expect(s.fondoAntes?.totalAssets).toBe("100000000");
    expect(s.fondoDespues?.totalAssets).toBe("100450000");
  });

  it("cada llamada manda el último estado firmado que devolvió el servidor", async () => {
    const b = backendFalso();
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS.slice(0, 2), simularRebote: false });
    await esperar(c, (x) => x.fase === "terminada");
    const firmas = b.llamadas.filter((l) => l.cuerpo.estado).map((l) => (l.cuerpo.estado as EstadoMandato).firma);
    // iniciar→f1; analizar a1 y a2 (f1, en paralelo); evaluar a1 (f1); ejecutar a1 (f1) → f2; evaluar a2 (f2); ejecutar a2 (f2)
    expect(firmas).toEqual(["f1", "f1", "f1", "f1", "f2", "f2"]);
  });

  it("el informe junta compras, omisiones, rechazos, rebote y replanificación; el resumen se puede copiar", async () => {
    const b = backendFalso();
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: true });
    const inf = armarInforme(await esperar(c, (x) => x.fase === "terminada"));
    expect(inf).not.toBeNull();
    if (!inf) return;
    expect(inf.omitidos.map((o) => o.activoId)).toEqual(["a3"]); // a5 ya se compró en la replanificación
    expect(inf.omitidos[0].razones.map((r) => r.regla)).toEqual(["cobertura"]);
    expect(inf.rechazadosPorContrato[0]).toMatchObject({ activoId: "a2", codigo: "CONCENTRACION_EXCEDIDA" });
    expect(inf.rebotes[0].replanificados).toEqual([{ activoId: "a5", nombre: "a5", resultado: "Compró" }]);
    const texto = resumenCopiable(inf);
    expect(texto).toContain("Patrimonio del fondo: $ 100.000.000 → $ 100.450.000");
    expect(texto).toContain("Liquidez: 41 % → 23 %");
    expect(texto).toContain("https://sepolia.basescan.org/tx/0xtxrebote");
    expect(texto).toContain("CONCENTRACION_EXCEDIDA");
    expect(texto).toContain("Prototipo en testnet");
    expect(texto).not.toMatch(/\b(IA|AI)\b|rinde|rendimiento/);
  });

  it("sin el interruptor de rebote, no rebota ni replanifica", async () => {
    const b = backendFalso();
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: false });
    const s = await esperar(c, (x) => x.fase === "terminada");
    expect(b.cuantas("/api/mandato/rebote")).toBe(0);
    expect(s.items).toHaveLength(5);
  });

  it("un error en el análisis de un activo no frena a los demás; el análisis se reintenta una vez (no hay compra a medias)", async () => {
    const b = backendFalso();
    b.fallar("/api/agente/mandato", "a3", 500);
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: false });
    const s = await esperar(c, (x) => x.fase === "terminada");
    expect(s.items[2]).toMatchObject({ resultado: "error", error: { codigo: "BOOM" } });
    expect(b.cuantas("/api/agente/mandato", "a3")).toBe(2); // el original y un reintento
    expect(s.items[0].resultado).toBe("compro");
    expect(s.items[3].resultado).toBe("compro");
    expect(contadores(s.items).errores).toBe(1);
  });

  it("si el análisis falla una vez y el reintento sale bien, la tarjeta sigue su camino", async () => {
    const b = backendFalso();
    b.fallarUnaVez("/api/agente/mandato", "a1", 502);
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS.slice(0, 1), simularRebote: false });
    const s = await esperar(c, (x) => x.fase === "terminada");
    expect(b.cuantas("/api/agente/mandato", "a1")).toBe(2);
    expect(s.items[0]).toMatchObject({ resultado: "compro" });
    expect(s.items[0].error).toBeUndefined();
  });

  it("un error al ejecutar (puede haber una compra a medias) deja la tarjeta con error y NO se reintenta; los demás siguen", async () => {
    const b = backendFalso();
    b.fallar("/api/mandato/ejecutar", "a1", 500);
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS.slice(0, 4), simularRebote: false });
    const s = await esperar(c, (x) => x.fase === "terminada");
    expect(s.items[0]).toMatchObject({ resultado: "error", error: { codigo: "BOOM" } });
    expect(b.cuantas("/api/mandato/ejecutar", "a1")).toBe(1);
    expect(b.cuantas("/api/agente/mandato", "a1")).toBe(1);
    expect(s.items[3].resultado).toBe("compro");
  });

  it("si no se puede iniciar el mandato, queda en fallo con el error", async () => {
    const b = backendFalso();
    b.fallar("/api/mandato/iniciar", "", 400);
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: false });
    expect(c.getSnapshot()).toMatchObject({ fase: "fallo", aviso: { codigo: "BOOM" } });
  });
});

describe("análisis en paralelo", () => {
  const analisis = (b: ReturnType<typeof backendFalso>, id?: string) => b.cuantas("/api/agente/mandato", id);

  it("lanza los análisis en paralelo (hasta la concurrencia), procesa en el orden de la bandeja y las compras salen en orden", async () => {
    const b = backendFalso();
    const abrir = Object.fromEntries(ACTIVOS.map((a) => [a.id, b.compuerta("/api/agente/mandato", a.id)]));
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: false }); // concurrencia por defecto: 4
    expect(analisis(b)).toBe(4); // a1..a4 arrancaron juntos; a5 espera un lugar
    expect(analisis(b, "a5")).toBe(0);
    expect(c.getSnapshot().items.map((i) => i.etapa)).toEqual(["analizando", "analizando", "analizando", "analizando", "pendiente"]);

    // terminan al revés: a4, a3, a2. Todavía le toca a a1: no se evalúa ni se compra nada
    abrir.a4();
    await esperar(c, (x) => x.items[3].etapa === "analizado");
    await new Promise((r) => setTimeout(r, 0));
    expect(analisis(b, "a5")).toBe(1); // se liberó un lugar: arranca a5
    abrir.a3();
    abrir.a2();
    const s1 = await esperar(c, (x) => x.items[1].etapa === "analizado" && x.items[2].etapa === "analizado");
    expect(s1.items[2].pasos).toHaveLength(2); // los pasos llegan aunque no sea su turno
    expect(s1.items[0].etapa).toBe("analizando");
    expect(b.cuantas("/api/mandato/evaluar")).toBe(0);
    expect(b.cuantas("/api/mandato/ejecutar")).toBe(0);

    abrir.a5();
    abrir.a1();
    const fin = await esperar(c, (x) => x.fase === "terminada");
    expect(resultados(fin)).toEqual(["a1:compro", "a2:contrato_no", "a3:omitio", "a4:compro", "a5:omitio"]);
    // evaluar y ejecutar siguen el orden de la bandeja, no el de llegada de los análisis
    const orden = (ruta: string) => b.llamadas.filter((l) => l.ruta === ruta).map((l) => ((l.cuerpo.activo ?? l.cuerpo.evaluacion) as { id?: string; activoId?: string }).id ?? (l.cuerpo.evaluacion as { activoId: string }).activoId);
    expect(orden("/api/mandato/evaluar")).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(orden("/api/mandato/ejecutar")).toEqual(["a1", "a2", "a4"]);
    // cada evaluación usa el estado vigente: la de a4 ya ve la compra de a1
    const evalA4 = b.llamadas.find((l) => l.ruta === "/api/mandato/evaluar" && (l.cuerpo.activo as ActivoBandeja).id === "a4");
    expect((evalA4?.cuerpo.estado as EstadoMandato).compras.map((x) => x.activoId)).toEqual(["a1"]);
    // los análisis se lanzaron con el estado inicial, sin compras
    for (const l of b.llamadas.filter((x) => x.ruta === "/api/agente/mandato")) expect((l.cuerpo.estado as EstadoMandato).compras).toHaveLength(0);
    expect(fin.estado?.compras.map((x) => x.activoId)).toEqual(["a1", "a4"]);
  });

  it("la concurrencia es configurable", async () => {
    const b = backendFalso();
    ACTIVOS.forEach((a) => b.compuerta("/api/agente/mandato", a.id));
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: false, concurrencia: 2 });
    expect(analisis(b)).toBe(2);
  });

  it("el CUIT sorpresa también entra al análisis en paralelo mientras la corrida sigue", async () => {
    const b = backendFalso();
    const abrir = b.compuerta("/api/agente/mandato", "a1");
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS.slice(0, 1), simularRebote: false });
    const r = activoSorpresa({ cuit: "30-70308853-4", nominal: "2.000.000", dias: "30", tipo: "cheque" }, 1);
    if (!r.ok) throw new Error("sorpresa inválida");
    c.agregarSorpresa(r.activo);
    expect(analisis(b, "sorpresa-1")).toBe(1); // arrancó sin esperar a a1
    abrir();
    const fin = await esperar(c, (x) => x.fase === "terminada");
    expect(resultados(fin)).toEqual(["a1:compro", "sorpresa-1:compro"]);
  });

  it("la replanificación reutiliza la cotización ya analizada: no se vuelve a analizar", async () => {
    const b = backendFalso();
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: true });
    await esperar(c, (x) => x.fase === "terminada");
    expect(analisis(b, "a5")).toBe(1);
    expect(b.cuantas("/api/mandato/evaluar", "a5")).toBe(2); // antes y después del rebote
  });
});

describe("pausa y reanudación", () => {
  it("pausar detiene el encadenado después de la llamada en curso y reanudar sigue", async () => {
    const b = backendFalso();
    const abrir = b.compuerta("/api/agente/mandato", "a2");
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: false });
    await esperar(c, (x) => x.items[0]?.etapa === "fin" && x.items[1]?.etapa === "analizando"); // a1 ya se compró; a2 sigue analizándose
    await new Promise((r) => setTimeout(r, 0)); // la corrida ya está esperando el análisis de a2
    c.pausar();
    expect(c.getSnapshot().pausaPedida).toBe(true);
    abrir();
    const s = await esperar(c, (x) => x.fase === "pausada");
    // a2 terminó su análisis y se decidió, pero no se ejecutó; los análisis en curso terminaron (a3 quedó analizado, sin evaluar);
    expect(s.items[1].etapa).toBe("evaluado");
    expect(s.items[2].etapa).toBe("analizado");
    expect(s.items[2].evaluacion).toBeUndefined();
    const antes = b.llamadas.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(b.llamadas.length).toBe(antes);

    c.reanudar();
    const fin = await esperar(c, (x) => x.fase === "terminada");
    expect(b.cuantas("/api/agente/mandato", "a2")).toBe(1); // no se vuelve a analizar
    expect(b.cuantas("/api/agente/mandato", "a3")).toBe(1);
    expect(fin.items[1].resultado).toBe("contrato_no");
    expect(fin.items.every((i) => i.etapa === "fin")).toBe(true);
  });
});

describe("pausa con análisis en cola", () => {
  it("en pausa no se lanzan análisis nuevos; al reanudar se retoman", async () => {
    const b = backendFalso();
    const abrir = b.compuerta("/api/agente/mandato", "a1");
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS.slice(0, 3), simularRebote: false, concurrencia: 1 });
    c.pausar();
    abrir();
    const s = await esperar(c, (x) => x.fase === "pausada");
    expect(b.cuantas("/api/agente/mandato", "a2")).toBe(0);
    expect(s.items[1].etapa).toBe("pendiente");
    expect(b.cuantas("/api/mandato/ejecutar")).toBe(0); // nada se ejecuta en pausa
    c.reanudar();
    const fin = await esperar(c, (x) => x.fase === "terminada");
    expect(resultados(fin)).toEqual(["a1:compro", "a2:contrato_no", "a3:omitio"]);
  });
});

describe("revocación", () => {
  it("espera la llamada en curso, revoca con el último estado y cancela lo pendiente", async () => {
    const b = backendFalso();
    const abrir = b.compuerta("/api/mandato/ejecutar", "a1");
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: true });
    await esperar(c, (x) => x.items[0]?.etapa === "ejecutando");
    const revocando = c.revocar();
    expect(c.getSnapshot().revocando).toBe(true);
    abrir();
    await revocando;
    const s = c.getSnapshot();
    expect(s.fase).toBe("revocada");
    expect(s.estado?.revocado).toBe(true);
    expect(s.items[0].resultado).toBe("compro"); // la compra en curso se completó
    expect(s.items.slice(1).every((i) => i.resultado === "cancelado")).toBe(true);
    // revocó con el estado que dejó esa compra (f2), no con uno viejo
    const rev = b.llamadas.find((l) => l.ruta === "/api/mandato/revocar");
    expect((rev?.cuerpo.estado as EstadoMandato).compras).toHaveLength(1);
    expect(b.cuantas("/api/mandato/ejecutar")).toBe(1); // no se ejecutó nada más
    expect(b.cuantas("/api/mandato/rebote")).toBe(0);
    expect(armarInforme(s)?.revocado).toBe(true);
  });

  it("al revocar se abortan los análisis en curso (AbortController) y no se espera por ellos", async () => {
    const b = backendFalso();
    b.compuerta("/api/agente/mandato", "a1"); // nunca se abre: el análisis queda colgado
    b.compuerta("/api/agente/mandato", "a2");
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: false });
    await esperar(c, (x) => x.items[0]?.etapa === "analizando");
    await c.revocar();
    const s = c.getSnapshot();
    expect(s.fase).toBe("revocada");
    const analisis = b.llamadas.filter((l) => l.ruta === "/api/agente/mandato");
    expect(analisis.length).toBeGreaterThanOrEqual(2);
    expect(analisis.every((l) => l.signal?.aborted === true)).toBe(true);
    expect(s.items.every((i) => i.resultado === "cancelado")).toBe(true);
    expect(b.cuantas("/api/mandato/ejecutar")).toBe(0);
    expect(b.cuantas("/api/mandato/revocar")).toBe(1);
  });

  it("también se puede revocar estando en pausa", async () => {
    const b = backendFalso();
    const c = nuevaCorrida(b);
    const abrir = b.compuerta("/api/agente/mandato", "a1");
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS, simularRebote: false });
    await esperar(c, (x) => x.items[0]?.etapa === "analizando");
    c.pausar();
    abrir();
    await esperar(c, (x) => x.fase === "pausada");
    await c.revocar();
    expect(c.getSnapshot().fase).toBe("revocada");
  });
});

describe("error de acceso", () => {
  it("pausa con el aviso, conserva el análisis y reanuda al volver a tener acceso", async () => {
    const b = backendFalso({ accesoOk: false });
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS.slice(0, 1), simularRebote: false });
    const s = await esperar(c, (x) => x.fase === "pausada");
    expect(s.aviso?.codigo).toBe("NO_AUTORIZADO");
    expect(s.items[0].etapa).toBe("evaluado");

    b.setAcceso(true);
    c.reanudar();
    const fin = await esperar(c, (x) => x.fase === "terminada");
    expect(fin.aviso).toBeNull();
    expect(fin.items[0].resultado).toBe("compro");
    expect(b.cuantas("/api/agente/mandato", "a1")).toBe(1);
  });

  it("sin acceso al rebote, queda pausada y no pierde las compras", async () => {
    const b = backendFalso();
    const c = nuevaCorrida(b);
    const abrir = b.compuerta("/api/mandato/rebote", "");
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS.slice(3, 4), simularRebote: true });
    await esperar(c, (x) => x.rebotando);
    b.setAcceso(false);
    abrir();
    const s = await esperar(c, (x) => x.fase === "pausada");
    expect(s.aviso?.codigo).toBe("NO_AUTORIZADO");
    expect(s.estado?.compras).toHaveLength(1);
    b.setAcceso(true);
    c.reanudar();
    const fin = await esperar(c, (x) => x.fase === "terminada");
    expect(fin.rebotes).toHaveLength(1);
  });
});

describe("aprobación humana", () => {
  it("espera, y al aprobar compra mandando aprobado: true", async () => {
    const b = backendFalso({ aprobacionSobre: "5000000" });
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: { ...MANDATO, aprobacionSobre: "5000000" }, activos: ACTIVOS.slice(0, 2), simularRebote: false });
    const s = await esperar(c, (x) => x.fase === "esperando_aprobacion");
    expect(s.items[0].resultado).toBe("esperando_aprobacion");
    expect(b.cuantas("/api/mandato/ejecutar")).toBe(0);
    c.aprobar("a1");
    const fin = await esperar(c, (x) => x.fase === "terminada");
    expect(b.llamadas.find((l) => l.ruta === "/api/mandato/ejecutar")?.cuerpo.aprobado).toBe(true);
    expect(fin.items.map((i) => i.resultado)).toEqual(["compro", "contrato_no"]);
  });

  it("al omitir, sigue con el resto sin comprar", async () => {
    const b = backendFalso({ aprobacionSobre: "5000000" });
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: { ...MANDATO, aprobacionSobre: "5000000" }, activos: ACTIVOS.slice(0, 3), simularRebote: false });
    await esperar(c, (x) => x.fase === "esperando_aprobacion");
    c.omitir("a1");
    const fin = await esperar(c, (x) => x.fase === "terminada");
    expect(fin.items[0].resultado).toBe("omitido_por_vos");
    expect(fin.estado?.compras).toHaveLength(0);
    expect(armarInforme(fin)?.omitidos.map((o) => o.activoId)).toEqual(["a1", "a3"]);
  });
});

describe("CUIT sorpresa", () => {
  it("corre el mismo circuito para un activo extra, aun con la corrida terminada", async () => {
    const b = backendFalso();
    const c = nuevaCorrida(b);
    await c.iniciar({ mandato: MANDATO, activos: ACTIVOS.slice(0, 1), simularRebote: false });
    await esperar(c, (x) => x.fase === "terminada");
    const r = activoSorpresa({ cuit: "30-70308853-4", nominal: "2.000.000", dias: "30", tipo: "cheque" }, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(c.agregarSorpresa(r.activo)).toBe("sorpresa-1");
    const fin = await esperar(c, (x) => x.fase === "terminada" && x.items.length === 2 && x.items[1].etapa === "fin");
    expect(fin.items[1].resultado).toBe("compro");
    expect(fin.fondoDespues).not.toBeNull();
  });
});

describe("formulario y validaciones", () => {
  it("porcentajes a basis points sin number flotante", () => {
    expect(porcentajeABps("15")).toBe(1500);
    expect(porcentajeABps("12,5")).toBe(1250);
    expect(porcentajeABps("0.05")).toBe(5);
    expect(porcentajeABps("abc")).toBeNull();
  });
  it("ida y vuelta del mandato por defecto", () => {
    const v = valoresDesdeMandato(MANDATO);
    expect(v).toMatchObject({ topePct: "15", exigeCobertura: true, coberturaPct: "100", pideAprobacion: false });
    const r = mandatoDesdeValores(v);
    expect(r).toEqual({ ok: true, mandato: MANDATO });
  });
  it("valida como el servidor", () => {
    const base = valoresDesdeMandato(MANDATO);
    const r = mandatoDesdeValores({ ...base, presupuesto: "150.000.000", topePct: "0,5", plazoMaxDias: "120", tipos: [], pideAprobacion: true, aprobacionSobre: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errores).sort()).toEqual(["aprobacion", "plazo", "presupuesto", "tipos", "tope"]);
    const ok = mandatoDesdeValores({ ...base, exigeCobertura: false, pideAprobacion: true, aprobacionSobre: "$ 5.000.000" });
    expect(ok).toMatchObject({ ok: true, mandato: { coberturaMinBps: null, aprobacionSobre: "5000000" } });
  });
  it("rechaza un CUIT sorpresa inválido", () => {
    const r = activoSorpresa({ cuit: "30-11111111-1", nominal: "0", dias: "0", tipo: "pagare" }, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errores)).toEqual(["cuit", "nominal", "dias"]);
  });
});

describe("cliente", () => {
  it("lee el evento final y falla con el error del servidor en el stream", () => {
    expect(parsearEventoMandato(JSON.stringify({ tipo: "evaluacion", evaluacion: { activoId: "x" } })).tipo).toBe("evaluacion");
    expect(parsearEventoMandato(JSON.stringify({ tipo: "analisis", cotizacion: { id: "0x1" } })).tipo).toBe("analisis");
    expect(parsearEventoMandato(JSON.stringify({ tipo: "reinicio" })).tipo).toBe("reinicio");
  });
  it("un stream que se corta sin evaluación da ANALISIS_INCOMPLETO", async () => {
    const cliente = crearClienteMandato(async () => new Response(`${JSON.stringify({ tipo: "paso", paso: { n: 1, tipo: "pensamiento", titulo: "t", detalle: "" } })}\n`));
    await expect(cliente.analizar({} as EstadoMandato, ACTIVOS[0], { onPaso: () => {}, onReinicio: () => {} })).rejects.toMatchObject({ codigo: "ANALISIS_INCOMPLETO" });
  });
  it("sin red devuelve RED", async () => {
    const cliente = crearClienteMandato(async () => { throw new Error("offline"); });
    await expect(cliente.revocar({} as EstadoMandato)).rejects.toMatchObject({ codigo: "RED" });
  });
});
