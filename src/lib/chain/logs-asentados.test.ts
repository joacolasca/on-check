import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { leerLogs } from "./estado";

const cfg = { chequeFund: "0x0000000000000000000000000000000000000001" as const, desdeBloque: 1000n };

function clienteFalso() {
  const pedidos: [bigint, bigint][] = [];
  const pc = {
    getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      pedidos.push([fromBlock, toBlock]);
      // un log por ventana, en su primer bloque
      return [{ eventName: "ChequeRegistrado", args: {}, transactionHash: "0x1", blockNumber: fromBlock, logIndex: 0 }];
    },
  } as unknown as PublicClient;
  return { pc, pedidos };
}

describe("logs asentados en memoria", () => {
  it("la segunda lectura pide solo lo nuevo", async () => {
    const { pc, pedidos } = clienteFalso();
    const primera = await leerLogs(pc, cfg, 30_000n);
    const alPrimero = pedidos.length;
    expect(alPrimero).toBeGreaterThan(1);
    const segunda = await leerLogs(pc, cfg, 30_050n);
    expect(pedidos.length).toBe(alPrimero + 1);
    expect(pedidos[pedidos.length - 1][0]).toBe(30_000n - 20n + 1n);
    expect(segunda.length).toBeGreaterThanOrEqual(primera.length);
  });

  it("los bloques recientes no se guardan: se vuelven a pedir", async () => {
    const { pc, pedidos } = clienteFalso();
    await leerLogs(pc, cfg, 5_000n);
    const antes = pedidos.length;
    await leerLogs(pc, cfg, 5_000n);
    expect(pedidos.length).toBe(antes + 1); // solo el margen final
    expect(pedidos[pedidos.length - 1]).toEqual([5_000n - 20n + 1n, 5_000n]);
  });

  it("un cliente distinto no comparte la memoria", async () => {
    const a = clienteFalso();
    const b = clienteFalso();
    await leerLogs(a.pc, cfg, 5_000n);
    await leerLogs(b.pc, cfg, 5_000n);
    expect(b.pedidos.length).toBe(a.pedidos.length);
  });
});
