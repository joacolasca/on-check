import { afterEach, describe, expect, it, vi } from "vitest";
import type { Cotizacion } from "@/shared/types";
import { calcularPuntaje } from "@/lib/scoring/puntaje";
import { CONFIG_FONDO } from "@/lib/scoring/config";
import { cotizar } from "@/lib/scoring/cotizar";
import { leerArgtReal } from "./argt";
import { ARGT_MAINNET_POR_DEFECTO, ConfigChainError, hayChain, leerConfig } from "./config";
import { datosDeCheque, guardarCotizacion, obtenerExplicacion, resolverCotizacion } from "./cotizaciones";
import { ErrorApi, traducirError } from "./errores";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  InternalRpcError,
  RpcRequestError,
  TimeoutError,
} from "viem";
import { fechaBA, leerLogs } from "./estado";
import { direccionDe } from "./clientes";
import { aV2, GARANTIA_EJEMPLO } from "./testutil";
import { aprobarKyc } from "./operaciones";

const CLAVE = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DIR = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const DIR_ADMIN = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // dirección de la clave pública de anvil #0
const DIR_PYME = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // anvil #1
const ENV_OK = {
  CHEQUE_FUND_ADDRESS: DIR, MOCK_ARGT_ADDRESS: DIR, CHEQUE_FUND_FROM_BLOCK: "1",
  DEPLOYER_PRIVATE_KEY: CLAVE, ORIGINADOR_PRIVATE_KEY: CLAVE, ORACULO_PRIVATE_KEY: CLAVE,
  INVERSOR1_PRIVATE_KEY: CLAVE, INVERSOR2_PRIVATE_KEY: CLAVE, PYME_PRIVATE_KEY: CLAVE,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("configuración", () => {
  it("sin contrato configurado no hay cadena (modo mock)", () => {
    expect(hayChain({})).toBe(false);
    expect(hayChain({ CHEQUE_FUND_ADDRESS: DIR })).toBe(true);
  });
  it("sin variables, usa el JSON del deploy como respaldo (el commiteado en shared/deployments)", () => {
    vi.stubEnv("CHAIN_DEPLOYMENT_FILE", "shared/deployments/base-sepolia.json");
    expect(hayChain({})).toBe(true);
    const c = leerConfig({ ...ENV_OK, CHEQUE_FUND_ADDRESS: "", MOCK_ARGT_ADDRESS: "", CHEQUE_FUND_FROM_BLOCK: undefined });
    expect(c.chequeFund).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(c.desdeBloque > 0n).toBe(true);
    vi.stubEnv("CHAIN_DEPLOYMENT_FILE", "no/existe.json");
    expect(hayChain({})).toBe(false);
  });
  it("lee la configuración completa con valores por defecto sensatos", () => {
    const c = leerConfig({ ...ENV_OK });
    expect(c.chequeFund).toBe(DIR);
    expect(c.rpcSepolia).toBe("https://sepolia.base.org");
    expect(c.argtMainnet).toBe(ARGT_MAINNET_POR_DEFECTO);
    expect(c.claves.admin).toBe(CLAVE);
  });
  it("acepta claves sin 0x", () => {
    expect(leerConfig({ ...ENV_OK, PYME_PRIVATE_KEY: CLAVE.slice(2) }).claves.pyme).toBe(CLAVE);
  });
  it("si faltan claves dice cuáles son pero nunca muestra ningún valor", () => {
    const { ORACULO_PRIVATE_KEY: _o, INVERSOR2_PRIVATE_KEY: _i, ...resto } = ENV_OK;
    void _o; void _i;
    let mensaje = "";
    try { leerConfig(resto); } catch (e) { mensaje = (e as Error).message; expect(e).toBeInstanceOf(ConfigChainError); }
    expect(mensaje).toContain("ORACULO_PRIVATE_KEY");
    expect(mensaje).toContain("INVERSOR2_PRIVATE_KEY");
    expect(mensaje).not.toContain(CLAVE);
  });
  describe("admin y pyme solo con dirección pública", () => {
    const { DEPLOYER_PRIVATE_KEY: _d, PYME_PRIVATE_KEY: _p, ...CUATRO } = ENV_OK;
    void _d; void _p;
    const SOLO_DIR = { ...CUATRO, ADMIN_ADDRESS: DIR_ADMIN, PYME_ADDRESS: DIR_PYME };
    it("con 4 claves y las direcciones de admin y pyme alcanza", () => {
      const c = leerConfig(SOLO_DIR);
      expect(c.claves.admin).toBeUndefined();
      expect(c.claves.pyme).toBeUndefined();
      expect(c.direcciones.admin).toBe(DIR_ADMIN);
      expect(c.direcciones.pyme).toBe(DIR_PYME);
      expect(c.claves.originador).toBe(CLAVE);
    });
    it("clave y dirección coincidentes: ok, la dirección sale de la clave", () => {
      const c = leerConfig({ ...ENV_OK, ADMIN_ADDRESS: DIR_ADMIN.toLowerCase(), PYME_ADDRESS: DIR_ADMIN });
      expect(c.direcciones.admin).toBe(DIR_ADMIN);
      expect(c.claves.admin).toBe(CLAVE);
    });
    it("clave y dirección que no coinciden: error sin mostrar valores", () => {
      let mensaje = "";
      try { leerConfig({ ...ENV_OK, ADMIN_ADDRESS: DIR_PYME }); } catch (e) { mensaje = (e as Error).message; expect(e).toBeInstanceOf(ConfigChainError); }
      expect(mensaje).toContain("ADMIN_ADDRESS");
      expect(mensaje).not.toContain(DIR_PYME);
      expect(mensaje).not.toContain(CLAVE);
    });
    it("dirección inválida: error", () => {
      expect(() => leerConfig({ ...SOLO_DIR, ADMIN_ADDRESS: "0x123" })).toThrow(/ADMIN_ADDRESS/);
      expect(() => leerConfig({ ...SOLO_DIR, PYME_ADDRESS: "nada" })).toThrow(/PYME_ADDRESS/);
    });
    it("falta pyme (ni clave ni dirección): error", () => {
      expect(() => leerConfig({ ...SOLO_DIR, PYME_ADDRESS: undefined })).toThrow(/PYME_PRIVATE_KEY o PYME_ADDRESS/);
    });
    it("falta admin (ni clave ni dirección): error", () => {
      expect(() => leerConfig({ ...SOLO_DIR, ADMIN_ADDRESS: undefined })).toThrow(/DEPLOYER_PRIVATE_KEY o ADMIN_ADDRESS/);
    });
    it("las 4 claves de firmantes siguen siendo obligatorias", () => {
      expect(() => leerConfig({ ...SOLO_DIR, ORIGINADOR_PRIVATE_KEY: undefined })).toThrow(/ORIGINADOR_PRIVATE_KEY/);
    });
    it("direccionDe funciona con y sin clave", () => {
      expect(direccionDe(leerConfig(SOLO_DIR), "admin")).toBe(DIR_ADMIN);
      expect(direccionDe(leerConfig(ENV_OK), "pyme")).toBe(DIR_ADMIN);
      expect(direccionDe(leerConfig(SOLO_DIR), "originador")).toBe(DIR_ADMIN);
    });
    it("KYC sin clave de admin: 503 sin llamar a la red", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const cfg = leerConfig(SOLO_DIR);
      await expect(aprobarKyc(cfg, "inversor1")).rejects.toMatchObject({ codigo: "CONFIGURACION", status: 503 });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
  it("rechaza direcciones inválidas", () => {
    expect(() => leerConfig({ ...ENV_OK, CHEQUE_FUND_ADDRESS: "0x123" })).toThrow(ConfigChainError);
  });
  it("el bloque de inicio es obligatorio: sin él, CONFIGURACION en vez de leer solo los últimos bloques", () => {
    const { CHEQUE_FUND_FROM_BLOCK: _b, ...sinBloque } = ENV_OK;
    void _b;
    expect(() => leerConfig(sinBloque)).toThrow(ConfigChainError);
    expect(() => leerConfig({ ...ENV_OK, CHEQUE_FUND_FROM_BLOCK: "" })).toThrow(/CHEQUE_FUND_FROM_BLOCK/);
    expect(leerConfig({ ...ENV_OK, CHEQUE_FUND_FROM_BLOCK: "123" }).desdeBloque).toBe(123n);
    expect(leerConfig({ ...ENV_OK, CHEQUE_FUND_FROM_BLOCK: "0" }).desdeBloque).toBe(0n);
  });
  it("rechaza un bloque de inicio inválido", () => {
    for (const malo of ["abc", "-1", "1.5", "0x10"]) {
      expect(() => leerConfig({ ...ENV_OK, CHEQUE_FUND_FROM_BLOCK: malo })).toThrow(ConfigChainError);
    }
  });
  it("ARGT_MAINNET_ADDRESS inválida usa la dirección verificada por defecto", () => {
    const ok = ENV_OK;
    expect(leerConfig({ ...ok, ARGT_MAINNET_ADDRESS: "no-es-una-direccion" }).argtMainnet).toBe(ARGT_MAINNET_POR_DEFECTO);
    expect(leerConfig({ ...ok, ARGT_MAINNET_ADDRESS: DIR }).argtMainnet).toBe(DIR);
  });
});

describe("cotizaciones", () => {
  const input = { cuit: "30703088534", nominal: "10000000", vencimiento: "2027-01-02", pyme: "0x0000000000000000000000000000000000000001" };
  const scoring = calcularPuntaje({ cuit: "30703088534", denominacion: "X", entidadesActuales: [], deudaPorPeriodo: [], rechazados: [], fuente: "bcra-cache", consultadoEn: "2026-11-03T12:00:00.000Z" }, new Date("2026-11-03T15:00:00Z"));
  const cot = aV2(cotizar(input, scoring, CONFIG_FONDO, new Date("2026-11-03T15:00:00Z"), "sal"));

  it("guarda y recupera una cotización y su explicación", () => {
    guardarCotizacion(cot);
    expect(resolverCotizacion(cot.id)).toEqual(cot);
    expect(resolverCotizacion(cot.id.toUpperCase().replace("0X", "0x"))).toEqual(cot);
    expect(obtenerExplicacion(cot.id)).toBe(cot.explicacion);
  });
  it("si no está en memoria acepta la del cliente solo si trae firma válida y su hash corresponde al contenido", () => {
    const otra = aV2(cotizar({ ...input, nominal: "5000000" }, scoring, CONFIG_FONDO, new Date("2026-11-03T15:00:00Z"), "sal"));
    expect(() => resolverCotizacion(otra.id, otra)).toThrow(ErrorApi); // sin firma
    guardarCotizacion(otra); // la firma
    (globalThis as unknown as { __cotizaciones: Map<string, unknown> }).__cotizaciones.delete(otra.id.toLowerCase());
    expect(resolverCotizacion(otra.id, { ...otra })).toEqual(otra);
    const adulterada: Cotizacion = { ...otra, precioCompra: "1" }; // precio cambiado a mano
    expect(() => resolverCotizacion(otra.id, adulterada)).toThrow(ErrorApi);
    expect(() => resolverCotizacion("0x" + "00".repeat(32))).toThrow(/No encontramos esa cotización/);
  });
  it("convierte los montos a unidades de 18 decimales y el vencimiento al fin del día de Buenos Aires", () => {
    const d = datosDeCheque(cot);
    expect(d.nominal).toBe(10_000_000n * 10n ** 18n);
    expect(d.precioCompra).toBe(9_506_849_320_000_000_000_000_000n); // 9.506.849,32 con 18 decimales (puntaje 100 → piso 30 % TNA, 60 días)
    expect(d.vencimiento).toBe(BigInt(Date.parse("2027-01-02T23:59:59-03:00") / 1000));
    expect(d.puntaje).toBe(scoring.puntaje);
    expect(d.tasaBps).toBe(cot.tasaTnaBps);
    expect(d.estado).toBe(0);
    expect(d.libradorHash).toBe(cot.libradorHash);
    // v2: sin garantía, el struct lleva tipo, industria y garantía en cero
    expect(d).toMatchObject({ tipo: 0, industria: cot.industria.id, tipoGarantia: 0, coberturaBps: 0, garantiaHash: `0x${"0".repeat(64)}` });
  });
  it("arma el struct v2 con el tipo, la industria y la garantía de la cotización", () => {
    const pagare = aV2(cot, { tipo: "pagare", garantia: GARANTIA_EJEMPLO });
    expect(datosDeCheque(pagare)).toMatchObject({ tipo: 1, industria: pagare.industria.id, tipoGarantia: 5, coberturaBps: 11000, garantiaHash: GARANTIA_EJEMPLO.garantiaHash });
  });
  it("exige los campos v2 en la cotización: sin tipo, industria válida o garantía completa → COTIZACION_INVALIDA", () => {
    const sinV2 = { ...cot, tipo: undefined } as unknown as Cotizacion;
    expect(() => datosDeCheque(sinV2)).toThrow(/tipo/);
    expect(() => datosDeCheque({ ...cot, industria: undefined } as unknown as Cotizacion)).toThrow(/industria/);
    expect(() => datosDeCheque({ ...cot, industria: { ...cot.industria, id: 13 } })).toThrow(/industria/);
    expect(() => datosDeCheque({ ...cot, garantia: { ...GARANTIA_EJEMPLO, garantiaHash: "0x12" } })).toThrow(/hash/);
    expect(() => datosDeCheque({ ...cot, garantia: { ...GARANTIA_EJEMPLO, coberturaBps: 70000 } })).toThrow(/cobertura/);
    expect(() => datosDeCheque({ ...cot, garantia: { ...GARANTIA_EJEMPLO, tipo: "nave" as never } })).toThrow(/garantía/);
    try {
      datosDeCheque(sinV2);
    } catch (e) {
      expect((e as ErrorApi).codigo).toBe("COTIZACION_INVALIDA");
    }
  });
  it("una cotización rechazada no se puede registrar", () => {
    const mala = cotizar({ ...input, vencimiento: "2027-09-01" }, scoring, CONFIG_FONDO, new Date("2026-11-03T15:00:00Z"), "sal");
    expect(() => datosDeCheque(mala)).toThrow(/plazo/);
  });
});

describe("fechas", () => {
  it("el vencimiento se muestra en la fecha de Buenos Aires, no en UTC", () => {
    const finDelDia = BigInt(Date.parse("2026-12-18T23:59:59-03:00") / 1000); // en UTC ya es el 19
    expect(fechaBA(finDelDia)).toBe("2026-12-18");
    expect(fechaBA(BigInt(Date.parse("2027-01-02T00:00:00-03:00") / 1000))).toBe("2027-01-02");
  });
});

describe("errores", () => {
  it("un ErrorApi pasa tal cual", () => {
    const e = new ErrorApi("X", "msg", 418);
    expect(traducirError(e)).toBe(e);
  });
  it("un error desconocido se traduce a un mensaje genérico sin filtrar detalles", () => {
    const t = traducirError(new Error("clave 0xdeadbeef"));
    expect(t.codigo).toBe("ERROR_INTERNO");
    expect(t.message).not.toContain("deadbeef");
  });

  describe("fallo del RPC vs revert real", () => {
    const URL_RPC = "https://rpc.ejemplo.test/v2/SECRETO";
    const abi = [{ type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const;
    const ejecucion = (revert: ContractFunctionRevertedError) => new ContractFunctionExecutionError(revert, { abi, functionName: "totalAssets" });
    // Reproduce la cadena real: Execution > Reverted > InternalRpcError > RpcRequestError.
    const cadena = (detalle: string) => {
      const rpc = new RpcRequestError({ body: {}, error: { code: -32603, message: detalle }, url: URL_RPC });
      const interno = new InternalRpcError(Object.assign(rpc, { details: detalle }));
      const revert = new ContractFunctionRevertedError({ abi, functionName: "totalAssets" });
      (revert as { cause?: unknown }).cause = interno;
      return ejecucion(revert);
    };
    const sinUrl = (m: string) => expect(m).not.toMatch(/https?:|rpc\.ejemplo|SECRETO/);

    it("un 429 dentro de una dirección no cuenta como saturación, y la falta de gas gana", () => {
      const revertCon429 = cadena("call to 0xab429cd4290000000000000000000000000004290 failed: internal error");
      expect(traducirError(revertCon429).codigo).toBe("RED_BLOCKCHAIN"); // InternalRpcError, pero no 429
      const rpc = new RpcRequestError({ body: {}, error: { code: -32603, message: "insufficient funds for gas * price + value" }, url: URL_RPC });
      expect(traducirError(new InternalRpcError(rpc)).codigo).toBe("SIN_GAS");
    });

    it("429 detrás de un revert sin datos es RED_BLOCKCHAIN_SATURADA 503", () => {
      const t = traducirError(cadena('failed to get account for 0x42: Max retries exceeded HTTP error 429 with body: {"code":-32005,"message":"Too Many Requests"}'));
      expect(t.codigo).toBe("RED_BLOCKCHAIN_SATURADA");
      expect(t.status).toBe(503);
      sinUrl(t.message);
    });
    it("un InternalRpcError genérico envuelto como revert sin datos es RED_BLOCKCHAIN 502", () => {
      const t = traducirError(cadena("an internal error was received"));
      expect(t.codigo).toBe("RED_BLOCKCHAIN");
      expect(t.status).toBe(502);
      sinUrl(t.message);
    });
    it("un TimeoutError suelto es RED_BLOCKCHAIN", () => {
      const t = traducirError(new TimeoutError({ body: {}, url: URL_RPC }));
      expect(t.codigo).toBe("RED_BLOCKCHAIN");
      sinUrl(t.message);
    });
    it("un HttpRequestError es RED_BLOCKCHAIN", () => {
      expect(traducirError(new HttpRequestError({ url: URL_RPC, details: "fetch failed" })).codigo).toBe("RED_BLOCKCHAIN");
    });
    it("un revert sin datos y sin señales de red sigue siendo CONTRATO_REVIRTIO", () => {
      const t = traducirError(ejecucion(new ContractFunctionRevertedError({ abi, functionName: "totalAssets" })));
      expect(t.codigo).toBe("CONTRATO_REVIRTIO");
      expect(t.status).toBe(409);
    });
    it("un revert decodificado (ConcentracionExcedida) no cambia", () => {
      const revert = new ContractFunctionRevertedError({ abi, functionName: "totalAssets" });
      (revert as { data?: unknown }).data = { errorName: "ConcentracionExcedida", args: ["0x00", 5_000_000n, 1_000_000n] };
      const t = traducirError(ejecucion(revert));
      expect(t.codigo).toBe("CONCENTRACION_EXCEDIDA");
      expect(t.status).toBe(409);
    });
  });
});

describe("ARGt real", () => {
  it("lee el totalSupply de mainnet con el contrato verificado de Twin", async () => {
    const pedido: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      pedido.push({ url: String(url), body: String(init?.body) });
      const id = (JSON.parse(String(init?.body)) as { id: number }).id;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: "0x00000000000000000000000000000000000000000035cb71d6f1c827076d4dd1" }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const r = await leerArgtReal({ BASE_MAINNET_RPC_URL: "https://rpc-de-prueba.invalid" });
    expect(r.fuente).toBe("base-mainnet");
    expect(r.direccion).toBe("0xf016413834E6D1A14F3D628B11D6Ef725a6bdbDD");
    expect(r.totalSupply).toBe("1000000000000000000000000".length > 0 ? BigInt("0x35cb71d6f1c827076d4dd1").toString() : "");
    expect(pedido[0].url).toBe("https://rpc-de-prueba.invalid/");
    expect(pedido[0].body.toLowerCase()).toContain(r.direccion.toLowerCase());
  });
  it("si no hay red, falla con un error traducido", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(leerArgtReal({ BASE_MAINNET_RPC_URL: "https://rpc-caido.invalid" })).rejects.toBeInstanceOf(ErrorApi);
  });
});

describe("robustez de la capa chain", () => {
  it("ARGT_MAINNET_ADDRESS inválida: leerArgtReal consulta la dirección por defecto", async () => {
    const usadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      usadas.push(JSON.stringify(body));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0x" + (5).toString(16).padStart(64, "0") }), { headers: { "content-type": "application/json" } });
    }));
    const r = await leerArgtReal({ ARGT_MAINNET_ADDRESS: "basura", BASE_MAINNET_RPC_URL: "https://rpc-argt-invalido.test" });
    expect(r.direccion).toBe(ARGT_MAINNET_POR_DEFECTO);
    expect(r.totalSupply).toBe("5");
  });

  it("un RPC de mainnet que no responde falla en ~10 s como máximo, sin colgar", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("abortado", "AbortError")));
    })));
    let resultado: "pendiente" | "error" | "ok" = "pendiente";
    const p = leerArgtReal({ BASE_MAINNET_RPC_URL: "https://rpc-colgado.test" }).then(() => (resultado = "ok"), () => (resultado = "error"));
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(resultado).toBe("error");
  });

  it("leerLogs en paralelo devuelve el mismo orden (bloque, logIndex) que en serie", async () => {
    const hasta = 9_000n * 5n + 123n; // 6 ventanas
    const log = (blockNumber: bigint, logIndex: number) => ({ eventName: "ChequeRegistrado", args: {}, transactionHash: "0x" as const, blockNumber, logIndex });
    const todos = [log(5n, 1), log(5n, 0), log(9_500n, 2), log(18_000n, 0), log(18_001n, 3), log(27_000n, 1), log(40_000n, 0), log(hasta, 7)];
    const pedidos: [bigint, bigint][] = [];
    let enVuelo = 0;
    let maxEnVuelo = 0;
    const pc = {
      getBlockNumber: async () => hasta,
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        pedidos.push([fromBlock, toBlock]);
        enVuelo += 1;
        maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
        // las ventanas tempranas tardan más: terminan desordenadas
        await new Promise((r) => setTimeout(r, Number((hasta - fromBlock) / 9_000n) * -5 + 40));
        enVuelo -= 1;
        return todos.filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock);
      },
    };
    const logs = await leerLogs(pc as never, { chequeFund: DIR as `0x${string}`, desdeBloque: 0n });
    const serie = [...todos].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
    expect(logs).toEqual(serie);
    expect(pedidos).toHaveLength(6);
    expect(maxEnVuelo).toBeGreaterThan(1);
    expect(maxEnVuelo).toBeLessThanOrEqual(4);
  });
});
