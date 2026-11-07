// Lecturas ancladas a un bloque, con un PublicClient falso (sin red).
import { beforeEach, describe, expect, it, vi } from "vitest";

const cliente = vi.hoisted(() => ({ pc: null as unknown }));
vi.mock("./clientes", () => ({ clienteSepolia: () => cliente.pc, direccionDe: (_c: unknown, rol: string) => `0x${rol.length.toString(16).padStart(40, "0")}` }));

import type { ConfigChain } from "./config";
import { ajustesLectura, bloqueEscrito, enBloqueConsistente, invalidarEstado, leerCuentas, leerEstado, registrarBloqueEscrito } from "./estado";

const DIR = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
let n = 0;
const nuevaCfg = () => ({ rpcSepolia: `http://rpc-${n++}`, chequeFund: DIR, mockArgt: DIR, desdeBloque: 1n }) as unknown as ConfigChain;

function falso(bloques: bigint[]) {
  const lecturas: { functionName: string; blockNumber?: bigint }[] = [];
  const logs: { toBlock: bigint }[] = [];
  let i = 0;
  const pc = {
    getBlockNumber: vi.fn(async () => bloques[Math.min(i++, bloques.length - 1)]),
    getLogs: vi.fn(async (a: { toBlock: bigint }) => (logs.push(a), [])),
    getBalance: vi.fn(async (a: { blockNumber?: bigint }) => (lecturas.push({ functionName: "getBalance", blockNumber: a.blockNumber }), 0n)),
    readContract: vi.fn(async (a: { functionName: string; blockNumber?: bigint }) => {
      lecturas.push({ functionName: a.functionName, blockNumber: a.blockNumber });
      if (a.functionName === "feeReceptor") return DIR;
      if (a.functionName === "modoDemo") return false;
      return a.functionName === "kyc" ? true : 10n ** 18n;
    }),
  };
  cliente.pc = pc;
  return { pc, lecturas, logs };
}

beforeEach(() => {
  ajustesLectura.esperaMs = 0;
  invalidarEstado();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("lecturas consistentes", () => {
  it("todas las lecturas y los logs van al mismo bloque", async () => {
    const { lecturas, logs } = falso([500n]);
    const e = await leerEstado(nuevaCfg());
    expect(e.bloque).toBe(500n);
    expect(logs.every((l) => l.toBlock === 500n)).toBe(true);
    expect(lecturas).toHaveLength(13); // v2: fondo, ARGt, precio de cuotaparte, supply, comisión (4 lecturas), política (4) y modoDemo
    expect(lecturas.every((l) => l.blockNumber === 500n)).toBe(true);
  });

  it("leerCuentas ancla getBalance y readContract al bloque", async () => {
    const { lecturas } = falso([700n]);
    await leerCuentas(nuevaCfg());
    expect(lecturas).toHaveLength(18);
    expect(lecturas.every((l) => l.blockNumber === 700n)).toBe(true);
  });

  it("nodo atrasado que se recupera al 2º intento", async () => {
    const { pc } = falso([99n, 100n]);
    const e = await leerEstado(nuevaCfg(), 100n);
    expect(e.bloque).toBe(100n);
    expect(pc.getBlockNumber).toHaveBeenCalledTimes(2);
  });

  it("atraso que no se recupera: sigue con el último bloque y no lanza", async () => {
    const { pc } = falso([90n, 91n, 92n, 93n, 94n]);
    const e = await leerEstado(nuevaCfg(), 100n);
    expect(e.bloque).toBe(94n);
    expect(pc.getBlockNumber).toHaveBeenCalledTimes(5); // 1 + 4 reintentos
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("'header not found' en un readContract cuenta como atraso y se reintenta", async () => {
    const { pc } = falso([100n, 101n]);
    pc.readContract.mockRejectedValueOnce(new Error("header not found"));
    const e = await leerEstado(nuevaCfg());
    expect(e.bloque).toBe(101n);
  });

  it("un error que no es de bloque faltante se propaga", async () => {
    const { pc } = falso([100n]);
    await expect(enBloqueConsistente(pc as never, undefined, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  });

  it("el memo se ignora si su bloque es menor al mínimo, y se reutiliza si alcanza", async () => {
    const { pc } = falso([100n, 100n, 110n]);
    const cfg = nuevaCfg();
    await leerEstado(cfg);
    await leerEstado(cfg, 100n); // alcanza: memo
    expect(pc.getBlockNumber).toHaveBeenCalledTimes(1);
    const e = await leerEstado(cfg, 105n); // no alcanza: relee
    expect(pc.getBlockNumber).toHaveBeenCalledTimes(3); // el 2º devuelve 100 (<105) y reintenta
    expect(e.bloque).toBe(110n);
  });

  it("el último bloque escrito en la instancia es piso de las lecturas", async () => {
    registrarBloqueEscrito(300n);
    registrarBloqueEscrito(250n);
    expect(bloqueEscrito()).toBe(300n);
    const { pc } = falso([299n, 300n]);
    const e = await leerEstado(nuevaCfg());
    expect(e.bloque).toBe(300n);
    expect(pc.getBlockNumber).toHaveBeenCalledTimes(2);
  });

  describe("cookie manipulada", () => {
    it("un bloque mínimo del futuro se ignora: no hay reintentos ni espera", async () => {
      const { pc } = falso([1000n]);
      const e = await leerEstado(nuevaCfg(), 10n ** 17n);
      expect(pc.getBlockNumber).toHaveBeenCalledTimes(1);
      expect(e.bloque).toBe(1000n);
    });

    it("un mínimo creíble pero muy por encima del nodo se lee sin esperar", async () => {
      const { pc } = falso([900n]); // ya se vio el bloque 1000: 1020 es creíble, pero el nodo está 120 bloques abajo
      const e = await leerEstado(nuevaCfg(), 1020n);
      expect(pc.getBlockNumber).toHaveBeenCalledTimes(1);
      expect(e.bloque).toBe(900n);
    });

    it("no saltea la caché compartida", async () => {
      const cfg = nuevaCfg();
      const { pc } = falso([1100n]);
      await leerEstado(cfg);
      await leerEstado(cfg, 10n ** 17n);
      expect(pc.getBlockNumber).toHaveBeenCalledTimes(1);
    });
  });
});
