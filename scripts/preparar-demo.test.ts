import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fechaMas, prepararDemo } from "./preparar-demo.mjs";

const fixtures = JSON.parse(readFileSync(new URL("../shared/fixtures/cheques-demo.json", import.meta.url), "utf8"));
const HOY = new Date("2026-11-03T15:00:00Z");

function apiFalsa(opciones: { totalAssets?: string; cotizacionRechazada?: boolean; saturaciones?: number } = {}) {
  let saturaciones = opciones.saturaciones ?? 0;
  const llamadas: string[] = [];
  const bodies: Record<string, unknown[]> = {};
  const cabeceras: Record<string, Record<string, string>[]> = {};
  let n = 0;
  const fetchFn = async (url: string, init?: RequestInit) => {
    const ruta = url.replace("http://api", "");
    const metodo = init?.method ?? "GET";
    llamadas.push(`${metodo} ${ruta.replace(/0x[0-9a-f]{64}/, ":id")}`);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    (bodies[`${metodo} ${ruta}`] ??= []).push(body);
    (cabeceras[`${metodo} ${ruta}`] ??= []).push((init?.headers ?? {}) as Record<string, string>);
    const ok = (x: unknown) => new Response(JSON.stringify(x), { status: 200 });
    if (ruta === "/api/fondo") return ok({ totalAssets: n > 0 ? "30000000" : (opciones.totalAssets ?? "0"), liquidez: "1", cantidadCheques: { Pending: 1, Funded: 2, Paid: 0, Rejected: 0 } });
    if (ruta === "/api/agente/analizar") { n += 1; return ok({ cotizacion: { id: "0x" + String(n).padStart(64, "a"), aprobada: !opciones.cotizacionRechazada, motivoRechazo: "plazo" } }); }
    if (ruta === "/api/demo/invertir" && saturaciones > 0) {
      saturaciones -= 1;
      return new Response(JSON.stringify({ error: { codigo: "RED_BLOCKCHAIN_SATURADA", mensaje: "saturada" } }), { status: 503 });
    }
    if (ruta === "/api/demo/invertir") return ok({ tx: "0x1", shares: body.cuotapartes, monto: `${body.cuotapartes}000` });
    return ok({ tx: "0x1" });
  };
  return { fetchFn: fetchFn as unknown as typeof fetch, llamadas, bodies, cabeceras };
}

describe("preparar demo", () => {
  it("fechaMas suma días en la fecha de Buenos Aires", () => {
    expect(fechaMas(HOY, 60)).toBe("2027-01-02");
    expect(fechaMas(HOY, 0)).toBe("2026-11-03");
  });

  it("carga el pool v2, fondea Coto, Cencosud y los dos pagarés con garantía y deja Telecom pendiente", async () => {
    const { fetchFn, llamadas, bodies } = apiFalsa();
    const r = await prepararDemo({ base: "http://api", fixtures, fetchFn, log: () => {}, hoy: HOY });
    expect(r.map((x: { escenario: string; estado: string }) => `${x.escenario}:${x.estado}`)).toEqual(["sano-2:Funded", "rebote:Funded", "pagare-energia:Funded", "pagare-vehiculo:Funded", "pendiente-con-antecedente:Pending"]);
    expect(llamadas.filter((l) => l.startsWith("POST /api/demo/kyc"))).toHaveLength(2);
    expect(llamadas.filter((l) => l.includes("/fondear"))).toHaveLength(4); // Telecom no se fondea
    expect(bodies["POST /api/demo/invertir"]).toEqual([
      { cuenta: "inversor1", cuotapartes: "70000" },
      { cuenta: "inversor2", cuotapartes: "30000" },
    ]); // pool v2: 100.000 cuotapartes (≈ $ 100.000.000), cada suscripción por encima del mínimo de 1.000
    const cot = bodies["POST /api/agente/analizar"] as { cuit: string; nominal: string; vencimiento: string }[];
    expect(cot.map((c) => c.cuit)).toEqual(["30548083156", "30590360763", "30526552659", "30500530851", "30639453738"]); // Coto, Cencosud, Pampa, Loma Negra, Telecom (verificados)
    expect(cot.map((c) => c.vencimiento)).toEqual(["2026-12-03", "2027-01-02", "2027-02-01", "2027-01-02", "2027-02-01"]); // 30, 60, 90, 60 y 90 días
    // v2: tipo y garantía viajan en la cotización (los pagarés de Pampa y Loma Negra llevan garantía)
    const cotV2 = bodies["POST /api/agente/analizar"] as { tipo?: string; garantia?: { tipo: string; valorDeclarado: string } }[];
    expect(cotV2.map((c) => c.tipo)).toEqual(["cheque", "cheque", "pagare", "pagare", "cheque"]);
    expect(cotV2.map((c) => c.garantia?.tipo)).toEqual([undefined, undefined, "energia", "vehiculo", undefined]);
    expect(cotV2[2].garantia?.valorDeclarado).toBe("16000000");
    // el orden: primero el pool, después cada cheque (analizar → registrar → fondear)
    expect(llamadas.indexOf("POST /api/demo/invertir")).toBeLessThan(llamadas.indexOf("POST /api/agente/analizar"));
  });

  it("registra mandando la cotización completa como respaldo", async () => {
    const { fetchFn, bodies } = apiFalsa();
    await prepararDemo({ base: "http://api", fixtures, fetchFn, log: () => {}, hoy: HOY });
    const reg = bodies["POST /api/cheques"][0] as { cotizacionId: string; cotizacion: { id: string } };
    expect(reg.cotizacion.id).toBe(reg.cotizacionId);
  });

  it("manda la clave de la demo en x-demo-clave en todos los pedidos (y no manda el header si no hay clave)", async () => {
    const con = apiFalsa();
    await prepararDemo({ base: "http://api", fixtures, fetchFn: con.fetchFn, log: () => {}, hoy: HOY, clave: "clave-de-prueba-0123456789" });
    const todas = Object.values(con.cabeceras).flat();
    expect(todas.length).toBeGreaterThan(8);
    expect(todas.every((h) => h["x-demo-clave"] === "clave-de-prueba-0123456789")).toBe(true);
    const sin = apiFalsa();
    await prepararDemo({ base: "http://api", fixtures, fetchFn: sin.fetchFn, log: () => {}, hoy: HOY, clave: "" });
    expect(Object.values(sin.cabeceras).flat().some((h) => "x-demo-clave" in h)).toBe(false);
  });

  it("detecta fondos con montos enormes sin pasar por number", async () => {
    const { fetchFn } = apiFalsa({ totalAssets: "99999999999999999999999999.5" });
    await expect(prepararDemo({ base: "http://api", fixtures, fetchFn, log: () => {}, hoy: HOY })).rejects.toThrow(/ya tiene fondos/);
    const cero = apiFalsa({ totalAssets: "0.00" });
    await expect(prepararDemo({ base: "http://api", fixtures, fetchFn: cero.fetchFn, log: () => {}, hoy: HOY })).resolves.toHaveLength(5);
  });

  it("no pisa una demo ya preparada, salvo con --forzar", async () => {
    const { fetchFn } = apiFalsa({ totalAssets: "30000000" });
    await expect(prepararDemo({ base: "http://api", fixtures, fetchFn, log: () => {}, hoy: HOY })).rejects.toThrow(/ya tiene fondos/);
    await expect(prepararDemo({ base: "http://api", fixtures, fetchFn, log: () => {}, hoy: HOY, forzar: true })).resolves.toHaveLength(5);
  });

  it("si una cotización no se aprueba, frena con un mensaje claro", async () => {
    const { fetchFn } = apiFalsa({ cotizacionRechazada: true });
    await expect(prepararDemo({ base: "http://api", fixtures, fetchFn, log: () => {}, hoy: HOY })).rejects.toThrow(/no fue aprobada: plazo/);
  });

  it("--solo-pool carga solo a los dos inversores y no cotiza, registra ni fondea nada", async () => {
    const { fetchFn, llamadas, bodies } = apiFalsa();
    const r = await prepararDemo({ base: "http://api", fixtures, fetchFn, log: () => {}, hoy: HOY, soloPool: true });
    expect(r).toEqual([]);
    expect(bodies["POST /api/demo/invertir"]).toEqual([
      { cuenta: "inversor1", cuotapartes: "70000" },
      { cuenta: "inversor2", cuotapartes: "30000" },
    ]);
    expect(llamadas.some((l) => l.includes("/api/agente/analizar") || l.includes("/api/cheques") || l.includes("/fondear"))).toBe(false);
  });

  it("--solo-pool reintenta ante RED_BLOCKCHAIN_SATURADA y sigue con el pool", async () => {
    const { fetchFn, bodies } = apiFalsa({ saturaciones: 2 });
    await prepararDemo({ base: "http://api", fixtures, fetchFn, log: () => {}, hoy: HOY, soloPool: true, esperaMs: 1 });
    expect(bodies["POST /api/demo/invertir"]).toHaveLength(4); // 2 intentos saturados + 2 suscripciones
  });

  it("--solo-pool tampoco pisa un fondo con fondos (salvo --forzar) y no se combina con --sin-pool", async () => {
    const { fetchFn } = apiFalsa({ totalAssets: "30000000" });
    await expect(prepararDemo({ base: "http://api", fixtures, fetchFn, log: () => {}, hoy: HOY, soloPool: true })).rejects.toThrow(/ya tiene fondos/);
    await expect(prepararDemo({ base: "http://api", fixtures, fetchFn, log: () => {}, hoy: HOY, soloPool: true, sinPool: true })).rejects.toThrow(/se excluyen/);
  });
});
