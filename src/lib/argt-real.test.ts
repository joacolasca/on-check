import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi } from "viem";
import { ARGT_ARBITRUM, armarPagoArgt, memoDeReferencia } from "./argt-real";

const DESTINO = "0x000000000000000000000000000000000000dEaD";

describe("armarPagoArgt", () => {
  it("arma un transfer estándar de ARGt en Arbitrum con la referencia al final", () => {
    const r = armarPagoArgt(DESTINO, "10", "CH-001");
    if ("error" in r) throw new Error(r.error);
    expect(r.to).toBe(ARGT_ARBITRUM);
    expect(r.monto).toBe(10n * 10n ** 18n);
    expect(r.data.endsWith(memoDeReferencia("CH-001").slice(2))).toBe(true);
    const base = r.data.slice(0, r.data.length - 64) as `0x${string}`;
    const dec = decodeFunctionData({ abi: erc20Abi, data: base });
    expect(dec.functionName).toBe("transfer");
    expect(dec.args).toEqual([DESTINO, 10n * 10n ** 18n]);
  });

  it("acepta decimales", () => {
    const r = armarPagoArgt(DESTINO, "1.5", "x");
    if ("error" in r) throw new Error(r.error);
    expect(r.monto).toBe(15n * 10n ** 17n);
  });

  it.each([
    ["no-es-direccion", "1", "x", "DESTINO_INVALIDO"],
    [DESTINO, "0", "x", "MONTO_INVALIDO"],
    [DESTINO, "-1", "x", "MONTO_INVALIDO"],
    [DESTINO, "1e3", "x", "MONTO_INVALIDO"],
    [DESTINO, "200.0001", "x", "MONTO_EXCEDE_TOPE"],
    [DESTINO, "1", "  ", "REFERENCIA_VACIA"],
  ])("rechaza %s / %s / %s", (d, m, ref, err) => {
    expect(armarPagoArgt(d, m, ref)).toEqual({ error: err });
  });

  it("el tope de 200 ARGt se permite justo", () => {
    expect("error" in armarPagoArgt(DESTINO, "200", "x")).toBe(false);
  });
});
