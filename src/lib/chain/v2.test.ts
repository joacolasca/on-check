// Capa chain v2: composición, plazo de rescates, explicación del gestor, errores nuevos y lectura del estado (cliente falso, sin red).
import { ContractFunctionExecutionError, ContractFunctionRevertedError, parseUnits } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashLibrador } from "@/lib/scoring";

const cliente = vi.hoisted(() => ({ pc: null as unknown }));
vi.mock("./clientes", () => ({ clienteSepolia: () => cliente.pc, direccionDe: () => "0x00000000000000000000000000000000000000a1" }));

import { componer, emisoresConocidos, nombreEmisor } from "./composicion";
import type { ConfigChain } from "./config";
import { ErrorApi, traducirError } from "./errores";
import { aChequeVista, ajustesLectura, invalidarEstado, leerEstado } from "./estado";
import { INDUSTRIAS, nombreIndustria } from "./industrias";
import { explicarLiquidacion, liquidableDesde } from "./rescates";

const W = (n: string) => parseUnits(n, 18);
const DIR = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const SAL = "sal-de-prueba";

describe("composición", () => {
  const item = (emisor: string, industria: number, tipo: "cheque" | "pagare", monto: string) => ({ emisor, emisorEtiqueta: emisor.toUpperCase(), industria, tipo, monto: W(monto) });
  const items = [item("a", 2, "cheque", "8614454.8"), item("b", 4, "pagare", "7485939.73"), item("c", 1, "cheque", "5871484.94"), item("d", 7, "pagare", "5742969.87")];

  it("los bps de cada eje suman exactamente 10000 y vienen de mayor a menor", () => {
    const c = componer(items);
    for (const eje of [c.porEmisor, c.porIndustria, c.porTipo]) expect(eje.reduce((s, p) => s + p.bps, 0)).toBe(10_000);
    expect(c.porEmisor.map((p) => p.clave)).toEqual(["a", "b", "c", "d"]);
    expect(c.porEmisor[0]).toMatchObject({ etiqueta: "A", monto: "8614454.8", bps: 3108 });
  });
  it("agrupa por industria (con el nombre de industrias.json) y por tipo", () => {
    const c = componer([...items, item("e", 2, "pagare", "1000000")]);
    expect(c.porIndustria.find((p) => p.clave === "2")).toMatchObject({ etiqueta: "Tecnología y comercio electrónico", monto: "9614454.8" });
    expect(c.porTipo.map((p) => p.clave).sort()).toEqual(["cheque", "pagare"]);
    expect(c.porTipo.find((p) => p.clave === "pagare")?.etiqueta).toBe("Pagarés");
  });
  it("reparte los restos sin perder bps (tres partes iguales)", () => {
    const c = componer([item("x", 1, "cheque", "1"), item("y", 2, "cheque", "1"), item("z", 3, "cheque", "1")]);
    expect(c.porEmisor.map((p) => p.bps).sort()).toEqual([3333, 3333, 3334]);
  });
  it("sin cartera: porciones vacías, nunca división por cero", () => {
    expect(componer([])).toEqual({ porEmisor: [], porIndustria: [], porTipo: [] });
  });
});

describe("emisores conocidos e industrias", () => {
  it("el hash con la sal del servidor coincide con los CUIT verificados de cheques-demo.json", () => {
    const m = emisoresConocidos(SAL);
    expect(nombreEmisor(hashLibrador("30703088534", SAL), m)).toBe("MERCADOLIBRE S.R.L.");
    expect(nombreEmisor(hashLibrador("30703088534", SAL).toUpperCase().replace("0X", "0x"), m)).toBe("MERCADOLIBRE S.R.L.");
    expect(nombreEmisor(hashLibrador("30500530851", SAL), m)).toMatch(/LOMA NEGRA/);
    expect(nombreEmisor(hashLibrador("20000000001", SAL), m)).toBeNull();
    expect(nombreEmisor(hashLibrador("30703088534", "otra-sal"), m)).toBeNull(); // el CUIT no va en claro: sin la sal no se reconoce
  });
  it("los nombres salen de shared/industrias.json", () => {
    expect(INDUSTRIAS).toHaveLength(13);
    expect(nombreIndustria(4)).toBe("Energía y servicios públicos");
    expect(nombreIndustria(0)).toBe("Sin clasificar");
  });
});

describe("plazo de rescate (liquidableDesde)", () => {
  // Buenos Aires = UTC−3. 2026-11-06 es viernes.
  const ba = (iso: string) => Date.parse(`${iso}-03:00`);
  const desde = (iso: string) => new Date(liquidableDesde(ba(iso))).toISOString();
  it("día hábil antes de las 15 hs: vence a las 00:00 del siguiente día hábil", () => {
    expect(desde("2026-11-04T10:00:00")).toBe("2026-11-05T03:00:00.000Z"); // miércoles → jueves 00:00 BA
    expect(desde("2026-11-06T14:59:59")).toBe("2026-11-09T03:00:00.000Z"); // viernes → lunes 00:00 BA
  });
  it("a las 15 hs o después, o en fin de semana: cuenta desde el siguiente día hábil", () => {
    expect(desde("2026-11-04T15:00:00")).toBe("2026-11-06T03:00:00.000Z"); // miércoles 15:00: cuenta el jueves, vence el viernes 00:00 BA
    expect(desde("2026-11-06T16:00:00")).toBe("2026-11-10T03:00:00.000Z"); // viernes tarde: cuenta lunes, vence martes
    expect(desde("2026-11-07T11:00:00")).toBe("2026-11-10T03:00:00.000Z"); // sábado
    expect(desde("2026-11-08T23:00:00")).toBe("2026-11-10T03:00:00.000Z"); // domingo
  });
});

describe("explicación del gestor", () => {
  const base = { liquidezAntes: W("67000000"), liquidezDespues: W("60000000"), totalAssetsDespues: W("93000000"), pagado: W("7000000"), cantidadLiquidados: 1, omitidos: 0, pendientesNoVencidos: 0, reservaMinimaBps: 1500, modoDemo: false };
  it("cuenta cuánto se pagó y cómo queda la liquidez frente a la reserva del 15 %", () => {
    const r = explicarLiquidacion(base);
    expect(r.liquidezDespuesBps).toBe(6451);
    expect(r.texto).toMatch(/Liquidé 1 rescate por \$ 7\.000\.000/);
    expect(r.texto).toMatch(/64,51 % del patrimonio/);
    expect(r.texto).toMatch(/por encima de la reserva mínima del 15 %/);
  });
  it("avisa cuando queda por debajo de la reserva, los que no alcanzaron y los que no vencieron", () => {
    const r = explicarLiquidacion({ ...base, liquidezDespues: W("10000000"), omitidos: 1, pendientesNoVencidos: 2, modoDemo: true });
    expect(r.texto).toMatch(/por debajo de la reserva mínima del 15 %/);
    expect(r.texto).toMatch(/modo demo/);
    expect(r.texto).toMatch(/falta de liquidez/);
    expect(r.texto).toMatch(/2 rescates sigue pendiente/);
    expect(r.texto).not.toMatch(/\bIA\b|\bAI\b|rinde/);
  });
  it("sin rescates dice que no había nada", () => {
    expect(explicarLiquidacion({ ...base, cantidadLiquidados: 0, pagado: 0n }).texto).toBe("No había rescates pendientes para liquidar.");
  });
});

describe("errores del contrato v2", () => {
  const abi = [{ type: "function", name: "fondearCheque", stateMutability: "nonpayable", inputs: [], outputs: [] }] as const;
  const revert = (errorName: string, args: unknown[]) => {
    const r = new ContractFunctionRevertedError({ abi, functionName: "fondearCheque" });
    (r as { data?: unknown }).data = { errorName, args };
    return new ContractFunctionExecutionError(r, { abi, functionName: "fondearCheque" });
  };
  it("IndustriaExcedida → INDUSTRIA_EXCEDIDA con la industria por nombre", () => {
    const t = traducirError(revert("IndustriaExcedida", [4, W("27000000"), W("25000000")]));
    expect(t).toMatchObject({ codigo: "INDUSTRIA_EXCEDIDA", status: 409 });
    expect(t.message).toMatch(/Energía y servicios públicos/);
    expect(t.message).toMatch(/\$ 27\.000\.000/);
    expect(t.message).toMatch(/\$ 25\.000\.000/);
  });
  it("LiquidezMinimaInsuficiente → LIQUIDEZ_MINIMA", () => {
    const t = traducirError(revert("LiquidezMinimaInsuficiente", [W("10000000"), W("15000000")]));
    expect(t).toMatchObject({ codigo: "LIQUIDEZ_MINIMA", status: 409 });
    expect(t.message).toMatch(/liquidez/);
  });
  it("las cuotapartes insuficientes de un rescate se explican", () => {
    expect(traducirError(revert("ERC20InsufficientBalance", ["0x1", 1n, 2n])).codigo).toBe("CUOTAPARTES_INSUFICIENTES");
  });
  it("sigue funcionando ConcentracionExcedida", () => {
    expect(traducirError(revert("ConcentracionExcedida", ["0x00", W("12500000"), W("10000000")])).codigo).toBe("CONCENTRACION_EXCEDIDA");
  });
  it("un ErrorApi pasa igual", () => expect(traducirError(new ErrorApi("X", "m", 418)).status).toBe(418));
});

describe("lectura del estado v2 (eventos con el struct completo)", () => {
  const cuit = (c: string) => hashLibrador(c, SAL);
  const registro = (n: number, cuitEmisor: string, o: { tipo: number; industria: number; garantia?: number; cobertura?: number; precio: string }, bloque: bigint) => ({
    eventName: "ChequeRegistrado",
    args: {
      id: `0x${n.toString(16).padStart(64, "0")}`,
      libradorHash: cuit(cuitEmisor),
      datos: {
        libradorHash: cuit(cuitEmisor),
        pyme: "0x00000000000000000000000000000000000000a1",
        nominal: W("10000000"),
        precioCompra: W(o.precio),
        vencimiento: BigInt(Date.parse("2027-01-02T23:59:59-03:00") / 1000),
        puntaje: 95,
        tasaBps: 2606,
        cotizacionHash: `0x${"cc".repeat(32)}`,
        tipo: o.tipo,
        industria: o.industria,
        tipoGarantia: o.garantia ?? 0,
        coberturaBps: o.cobertura ?? 0,
        garantiaHash: `0x${"00".repeat(32)}`,
        estado: 0,
      },
    },
    transactionHash: `0x${"a".repeat(64)}`,
    blockNumber: bloque,
    logIndex: 0,
  });
  const fondeo = (n: number, bloque: bigint) => ({ eventName: "ChequeFondeado", args: { id: `0x${n.toString(16).padStart(64, "0")}` }, transactionHash: `0x${"b".repeat(64)}`, blockNumber: bloque, logIndex: 1 });
  const solicitud = (id: number, duenio: string, bloque: bigint) => ({ eventName: "RescateSolicitado", args: { id: BigInt(id), duenio, shares: W("1000"), liquidableDesde: BigInt(Date.parse("2026-11-10T03:00:00Z") / 1000) }, transactionHash: `0x${"d".repeat(64)}`, blockNumber: bloque, logIndex: 0 });

  function falso(logs: unknown[]) {
    const lecturas: Record<string, unknown> = {
      totalAssets: W("100000000"),
      balanceOf: W("90000000"),
      convertToAssets: W("1000"),
      totalSupply: W("100000"),
      comisionPendiente: W("10"),
      feeReceptor: "0x00000000000000000000000000000000000000fe",
      maxConcentracionBps: 1000,
      maxIndustriaBps: 2500,
      liquidezMinBps: 1500,
      comisionAnualBps: 300,
      modoDemo: true,
    };
    cliente.pc = {
      getBlockNumber: async () => 100n,
      getLogs: async () => logs,
      getBlock: async () => ({ timestamp: BigInt(Date.parse("2026-11-06T13:00:00Z") / 1000) }),
      readContract: async (a: { functionName: string }) => lecturas[a.functionName],
    };
  }
  let n = 0;
  const cfg = () => ({ rpcSepolia: `http://rpc-v2-${n++}`, chequeFund: DIR, mockArgt: DIR, desdeBloque: 1n }) as unknown as ConfigChain;

  beforeEach(() => {
    vi.stubEnv("CUIT_SALT", SAL);
    ajustesLectura.esperaMs = 0;
    invalidarEstado();
  });

  it("arma el ResumenFondo v2 y las ChequeVista v2 con tipo, industria, emisor y garantía", async () => {
    falso([
      registro(1, "30703088534", { tipo: 0, industria: 2, precio: "8600000" }, 10n),
      registro(2, "30526552659", { tipo: 1, industria: 4, garantia: 5, cobertura: 11000, precio: "7500000" }, 11n),
      registro(3, "30548083156", { tipo: 0, industria: 1, precio: "5900000" }, 12n),
      fondeo(1, 13n),
      fondeo(2, 14n),
      solicitud(1, "0x00000000000000000000000000000000000000a1", 15n),
    ]);
    const e = await leerEstado(cfg());
    const r = e.resumen;
    expect(r.politica).toMatchObject({ maxEmisorBps: 1000, maxIndustriaBps: 2500, liquidezMinBps: 1500, objetivoTnaBps: 4000, comisionAnualBps: 300, precioInicialCuotaparte: "1000" });
    expect(r.cantidadCheques).toEqual({ Pending: 1, Funded: 2, Paid: 0, Rejected: 0 });
    expect(r.composicion.porEmisor.map((p) => p.etiqueta)).toEqual(["MERCADOLIBRE S.R.L.", "PAMPA ENERGIA S A"]);
    expect(r.composicion.porEmisor.reduce((s, p) => s + p.bps, 0)).toBe(10_000);
    expect(r.composicion.porIndustria.map((p) => p.etiqueta)).toEqual(["Tecnología y comercio electrónico", "Energía y servicios públicos"]);
    expect(r.composicion.porTipo.map((p) => p.clave)).toEqual(["cheque", "pagare"]);
    expect(r.concentracionMaxBps).toBe(860);
    expect(r.liquidezBps).toBe(9000);
    expect(r.cuotapartesEmitidas).toBe("100000");
    expect(r.comision.devengadaCuotapartes).toBe("90000010"); // balanceOf(feeReceptor) (simulado) + pendiente
    expect(r.rescatesPendientes).toBe(1);
    expect(r.modoDemo).toBe(true);
    expect(e.rescates[0]).toMatchObject({ id: "1", cuotapartes: "1000", estado: "Pendiente", liquidableDesde: "2026-11-10T03:00:00.000Z", solicitadoEn: "2026-11-06T13:00:00.000Z" });

    const vistas = e.cheques.map((c) => aChequeVista(c, emisoresConocidos(SAL)));
    expect(vistas[0]).toMatchObject({ tipo: "cheque", industria: "Tecnología y comercio electrónico", emisorNombre: "MERCADOLIBRE S.R.L.", garantia: null, estado: "Funded" });
    expect(vistas[1]).toMatchObject({ tipo: "pagare", industria: "Energía y servicios públicos", garantia: { tipo: "energia", coberturaBps: 11000 } });
    expect(vistas[2]).toMatchObject({ estado: "Pending", emisorNombre: "COTO CENTRO INTEGRAL DE COMERCIALIZACION SA" });
  });

  it("un emisor desconocido sale con el hash corto y emisorNombre null", async () => {
    falso([registro(1, "20000000001", { tipo: 0, industria: 0, precio: "1000000" }, 10n), fondeo(1, 11n)]);
    const e = await leerEstado(cfg());
    expect(e.resumen.composicion.porEmisor[0].etiqueta).toMatch(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/);
    expect(aChequeVista(e.cheques[0], emisoresConocidos(SAL)).emisorNombre).toBeNull();
  });
});
