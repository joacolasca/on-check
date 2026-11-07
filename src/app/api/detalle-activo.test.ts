// GET /api/cheques/[id] (modo mock y con cadena simulada) y el informe que guardan las rutas del agente.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import chequesMock from "@fixtures/api/cheques.json";
import type { ChequeDetalle } from "@/lib/detalle-cheque";
import type { InformeActivo } from "@/lib/agent/informe";

const cadena = vi.hoisted(() => ({
  cheques: [] as { id: string; cotizacionHash: string; libradorHash: string }[],
}));
vi.mock("@/lib/chain", async () => {
  const real = await vi.importActual<typeof import("@/lib/chain")>("@/lib/chain");
  return {
    ...real,
    hayChain: () => cadena.cheques.length > 0,
    leerConfig: () => ({}),
    leerEstado: async () => ({ cheques: cadena.cheques }),
    aChequeVista: (c: { id: string }) => ({ ...(chequesMock[0] as object), id: c.id, txs: [{ tipo: "registrar", hash: "0x" + "aa".repeat(32), url: "https://sepolia.basescan.org/tx/x" }] }),
  };
});

import { guardarInforme, MAX_INFORMES, obtenerInforme } from "@/lib/chain/cotizaciones";
import { analizarCheque } from "@/lib/agent";
import { armarInforme } from "@/lib/agent/informe";
import { GET } from "./cheques/[id]/route";
import { POST as ANALIZAR } from "./agente/analizar/route";

const ID_FIXTURE = (chequesMock as { id: string }[])[0].id;
const ID_NUEVO = "0x" + "12".repeat(32);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pedir = (id: string) => GET(new Request(`http://localhost/api/cheques/${id}`), ctx(id));
const input = { cuit: "30703088534", nominal: "10000000", vencimiento: "2027-01-05", pyme: "0x0000000000000000000000000000000000000001" };

async function informeDe(id: string, hash: string): Promise<InformeActivo> {
  const i = armarInforme(await analizarCheque(input), { generadoEn: "2026-11-07T12:00:00.000Z" });
  return { ...i, cotizacion: { id, cotizacionHash: hash } };
}

beforeEach(() => {
  cadena.cheques = [];
  vi.stubEnv("API_MODE", "mock");
  vi.stubEnv("CHEQUE_FUND_ADDRESS", "");
  vi.stubEnv("AGENT_MODE", "determinista"); // nunca llamar a un modelo desde los tests
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cheques/[id] · modo mock", () => {
  it("id mal formado → 400 DATOS_INVALIDOS", async () => {
    const r = await pedir("hola");
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: { codigo: string } }).error.codigo).toBe("DATOS_INVALIDOS");
  });

  it("activo que no existe → 404 CHEQUE_INEXISTENTE", async () => {
    const r = await pedir(ID_NUEVO);
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: { codigo: string } }).error.codigo).toBe("CHEQUE_INEXISTENTE");
  });

  it("activo del ejemplo, sin informe → 200 con informe null", async () => {
    const r = await pedir(ID_FIXTURE.toUpperCase().replace("0X", "0x"));
    expect(r.status).toBe(200);
    const d = (await r.json()) as ChequeDetalle;
    expect(d.cheque.id).toBe(ID_FIXTURE);
    expect(d.informe).toBeNull();
    expect(d.cotizacionHash).toBeNull();
    expect(d.historial).toEqual(d.cheque.txs);
  });

  it("con informe en memoria → lo devuelve", async () => {
    guardarInforme(ID_FIXTURE, await informeDe(ID_FIXTURE, "0x" + "cd".repeat(32)));
    const d = (await (await pedir(ID_FIXTURE)).json()) as ChequeDetalle;
    expect(d.informe?.cotizacion.id).toBe(ID_FIXTURE);
    expect(d.informe?.decision.aprobada).toBe(true);
  });
});

describe("GET /api/cheques/[id] · con cadena", () => {
  const HASH = "0x" + "ee".repeat(32);

  it("activo inexistente → 404", async () => {
    cadena.cheques = [{ id: ID_FIXTURE, cotizacionHash: HASH, libradorHash: "0x" + "11".repeat(32) }];
    expect((await pedir(ID_NUEVO)).status).toBe(404);
  });

  it("devuelve el activo on-chain con su hash y el informe solo si coincide con el hash registrado", async () => {
    cadena.cheques = [{ id: ID_NUEVO, cotizacionHash: HASH, libradorHash: "0x" + "11".repeat(32) }];
    guardarInforme(ID_NUEVO, await informeDe(ID_NUEVO, HASH.toUpperCase().replace("0X", "0x")));
    let d = (await (await pedir(ID_NUEVO)).json()) as ChequeDetalle;
    expect(d.cotizacionHash).toBe(HASH);
    expect(d.libradorHash).toBe("0x" + "11".repeat(32));
    expect(d.historial).toHaveLength(1);
    expect(d.informe).not.toBeNull();

    guardarInforme(ID_NUEVO, await informeDe(ID_NUEVO, "0x" + "99".repeat(32))); // otro análisis del mismo id
    d = (await (await pedir(ID_NUEVO)).json()) as ChequeDetalle;
    expect(d.informe).toBeNull();
  });
});

describe("informes en memoria", () => {
  it("la memoria está acotada", async () => {
    const i = await informeDe(ID_NUEVO, "0x" + "01".repeat(32));
    for (let n = 0; n < MAX_INFORMES + 20; n++) guardarInforme(`0x${n.toString(16).padStart(64, "0")}`, i);
    const g = globalThis as unknown as { __informes: Map<string, unknown> };
    expect(g.__informes.size).toBeLessThanOrEqual(MAX_INFORMES);
  });

  it("vence a las 12 horas", async () => {
    const i = await informeDe(ID_NUEVO, "0x" + "02".repeat(32));
    const t0 = 1_000_000;
    guardarInforme(ID_NUEVO, i, t0);
    expect(obtenerInforme(ID_NUEVO, t0 + 11 * 3_600_000)).not.toBeNull();
    expect(obtenerInforme(ID_NUEVO, t0 + 13 * 3_600_000)).toBeNull();
  });
});

describe("POST /api/agente/analizar guarda y devuelve el informe", () => {
  const pedirAnalisis = (accept?: string) =>
    ANALIZAR(new Request("http://localhost/api/agente/analizar", { method: "POST", headers: { "content-type": "application/json", ...(accept ? { accept } : {}) }, body: JSON.stringify(input) }));

  it("JSON: incluye informe y lo deja en memoria para el detalle", async () => {
    const r = (await (await pedirAnalisis()).json()) as { cotizacion: { id: string; cotizacionHash: string }; informe: InformeActivo };
    expect(r.informe.cotizacion).toEqual({ id: r.cotizacion.id, cotizacionHash: r.cotizacion.cotizacionHash });
    expect(JSON.stringify(r.informe)).not.toContain("30703088534");
    expect(obtenerInforme(r.cotizacion.id)).not.toBeNull();
  });

  it("NDJSON: el evento resultado trae el informe", async () => {
    const res = await pedirAnalisis("application/x-ndjson");
    const eventos = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as { tipo: string; informe?: InformeActivo });
    expect(eventos.find((e) => e.tipo === "resultado")?.informe?.version).toBe(2);
  });
});
