// Cotizaciones firmadas (HMAC), anti-reuso y pyme del servidor. La cadena está simulada: se cuentan las txs que se mandarían.
import { parseUnits } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calcularPuntaje } from "@/lib/scoring/puntaje";
import { CONFIG_FONDO } from "@/lib/scoring/config";
import { cotizar, hashearCotizacion } from "@/lib/scoring/cotizar";
import type { Cotizacion } from "@/shared/types";
import { aV2 } from "./testutil";

const PYME_SERVIDOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const AJENA = "0x00000000000000000000000000000000000000Aa";
const envios = vi.hoisted(() => ({ n: 0 }));
const UN_TOKEN = 10n ** 18n;
// Estado del fondo que ve el control de límites (pool de demo: $ 100 M, todo en liquidez, sin exposición). `falla` simula que no se puede leer.
const fondo = vi.hoisted(() => ({ falla: false, totalAssets: 100_000_000n * 10n ** 18n, liquidez: 100_000_000n * 10n ** 18n, exposicion: new Map<string, bigint>() }));

vi.mock("./estado", () => ({
  invalidarEstado: () => undefined,
  registrarBloqueEscrito: () => undefined,
  leerEstado: async () => {
    if (fondo.falla) throw new Error("RPC caído");
    return {
      totalAssets: fondo.totalAssets,
      liquidez: fondo.liquidez,
      exposicion: fondo.exposicion,
      exposicionIndustria: new Map<number, bigint>(),
      cheques: [],
      resumen: { politica: { maxEmisorBps: 1000, maxIndustriaBps: 2500, liquidezMinBps: 1500 } },
    };
  },
}));

vi.mock("./clientes", () => ({
  direccionDe: () => "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  billetera: () => ({
    account: "0x1",
    wallet: {
      writeContract: async () => {
        envios.n += 1;
        return "0x" + "11".repeat(32);
      },
    },
  }),
  clienteSepolia: () => ({
    simulateContract: async () => ({ request: {} }),
    estimateContractGas: async () => 100_000n,
    waitForTransactionReceipt: async () => ({ status: "success" }),
  }),
}));

import { guardarCotizacion, resolverCotizacion } from "./cotizaciones";
import { ErrorApi } from "./errores";
import { registrarCheque } from "./operaciones";
import type { ConfigChain } from "./config";

const CFG = { chequeFund: "0x5FbDB2315678afecb367f032d93F642f64180aa3" } as unknown as ConfigChain;
const AHORA = new Date("2026-11-03T15:00:00Z");
const scoring = calcularPuntaje({ cuit: "30703088534", denominacion: "X", entidadesActuales: [], deudaPorPeriodo: [], rechazados: [], fuente: "bcra-cache", consultadoEn: "2026-11-03T12:00:00.000Z" }, AHORA);
let semilla = 0;
const nueva = (pyme = PYME_SERVIDOR): Cotizacion => {
  semilla += 1;
  return aV2(cotizar({ cuit: "30703088534", nominal: String(1_000_000 + semilla), vencimiento: "2026-12-03", pyme }, scoring, CONFIG_FONDO, AHORA, "sal"));
};
const vaciarMemoria = () => (globalThis as unknown as { __cotizaciones: Map<string, unknown> }).__cotizaciones.clear();
const copia = (c: Cotizacion): Cotizacion => JSON.parse(JSON.stringify(c));
const rechazo = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    return e as ErrorApi;
  }
  throw new Error("no rechazó");
};

beforeEach(() => {
  envios.n = 0;
  fondo.falla = false;
  fondo.totalAssets = 100_000_000n * UN_TOKEN;
  fondo.liquidez = 100_000_000n * UN_TOKEN;
  fondo.exposicion = new Map();
  vi.stubEnv("COTIZACION_SECRETO", "s".repeat(40));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("firma de la cotización", () => {
  it("guardarCotizacion le pone la firma al mismo objeto (así la ruta del agente responde la cotización firmada)", () => {
    const c = nueva();
    expect(c.firma).toBeUndefined();
    guardarCotizacion(c);
    const exp = Math.floor(AHORA.getTime() / 1000) + 30 * 60;
    expect(c.firma).toMatch(new RegExp(`^${exp}\\.[0-9a-f]{64}$`));
    expect(JSON.parse(JSON.stringify({ cotizacion: c })).cotizacion.firma).toBe(c.firma); // lo que serializa la ruta del agente
    expect(resolverCotizacion(c.id)).toBe(c);
  });

  it("sin secreto: en producción falla cerrado (503) y en desarrollo usa uno aleatorio", () => {
    vi.stubEnv("COTIZACION_SECRETO", "corto");
    vi.stubEnv("NODE_ENV", "production");
    const e = (() => {
      try {
        guardarCotizacion(nueva());
      } catch (x) {
        return x as ErrorApi;
      }
    })();
    expect(e).toMatchObject({ codigo: "CONFIGURACION", status: 503 });
    vi.stubEnv("NODE_ENV", "test");
    const c = nueva();
    guardarCotizacion(c);
    expect(c.firma).toBeDefined();
  });

  it("una cotización del cliente sin firma → 403 COTIZACION_INVALIDA", async () => {
    const c = nueva();
    guardarCotizacion(c);
    const del = copia(c);
    delete del.firma;
    vaciarMemoria();
    const e = await rechazo(() => resolverCotizacion(c.id, del));
    expect(e).toMatchObject({ codigo: "COTIZACION_INVALIDA", status: 403 });
  });

  it("firma adulterada o mal formada → 403", async () => {
    const c = nueva();
    guardarCotizacion(c);
    vaciarMemoria();
    const [exp, mac] = (c.firma as string).split(".");
    for (const firma of [`${exp}.${"0".repeat(64)}`, `${Number(exp) + 100}.${mac}`, mac, "basura", `${exp}.${mac.toUpperCase()}`, ""]) {
      const e = await rechazo(() => resolverCotizacion(c.id, { ...copia(c), firma }));
      expect(e).toMatchObject({ codigo: "COTIZACION_INVALIDA", status: 403 });
    }
  });

  it("contenido cambiado con la firma original → 403 (precio, pyme, librador, nominal, vencimiento)", async () => {
    const c = nueva();
    guardarCotizacion(c);
    vaciarMemoria();
    const cambios: Record<string, (x: Cotizacion) => void> = {
      precioCompra: (x) => void (x.precioCompra = "1"),
      pyme: (x) => void (x.input.pyme = AJENA),
      libradorHash: (x) => void (x.libradorHash = "0x" + "cd".repeat(32)),
      nominal: (x) => void (x.input.nominal = "99999999"),
      vencimiento: (x) => void (x.input.vencimiento = "2026-12-04"),
    };
    for (const [campo, mutar] of Object.entries(cambios)) {
      const x = copia(c);
      mutar(x);
      const e = await rechazo(() => resolverCotizacion(c.id, x));
      expect(e, campo).toMatchObject({ codigo: "COTIZACION_INVALIDA", status: 403 });
      // aunque el atacante recalcule el hash, la firma ya no corresponde
      const { cotizacionHash: _h, firma: _f, ...sin } = x;
      void _h; void _f;
      const recalculada = { ...x, cotizacionHash: hashearCotizacion(sin) };
      expect(await rechazo(() => resolverCotizacion(c.id, recalculada)), campo).toMatchObject({ codigo: "COTIZACION_INVALIDA" });
    }
  });

  it("firma válida pero contenido sin integridad (explicación cambiada) o id distinto → 403", async () => {
    const c = nueva();
    guardarCotizacion(c);
    vaciarMemoria();
    expect(await rechazo(() => resolverCotizacion(c.id, { ...copia(c), explicacion: "otra" }))).toMatchObject({ codigo: "COTIZACION_INVALIDA" });
    expect(await rechazo(() => resolverCotizacion("0x" + "ab".repeat(32), copia(c)))).toMatchObject({ codigo: "COTIZACION_INVALIDA" });
  });

  it("firma vencida → 403 con mensaje de que venció", async () => {
    const c = nueva();
    guardarCotizacion(c);
    vaciarMemoria();
    const del = copia(c);
    expect(resolverCotizacion(c.id, del)).toEqual(c); // vigente
    vi.setSystemTime(new Date(AHORA.getTime() + 31 * 60_000));
    const e = await rechazo(() => resolverCotizacion(c.id, del));
    expect(e).toMatchObject({ codigo: "COTIZACION_INVALIDA", status: 403 });
    expect(e.message).toMatch(/venció/);
  });

  it("una firma de otro secreto no sirve", async () => {
    const c = nueva();
    guardarCotizacion(c);
    vaciarMemoria();
    vi.stubEnv("COTIZACION_SECRETO", "z".repeat(40));
    expect(await rechazo(() => resolverCotizacion(c.id, copia(c)))).toMatchObject({ codigo: "COTIZACION_INVALIDA" });
  });
});

describe("registrarCheque", () => {
  it("una cotización válida reenviada por el cliente (servidor sin memoria, otra instancia) se registra", async () => {
    const c = nueva();
    guardarCotizacion(c);
    const del = copia(c);
    vaciarMemoria();
    const r = await registrarCheque(CFG, c.id, del);
    expect(r.chequeId).toBe(c.id);
    expect(envios.n).toBe(1);
  });

  it("sin firma no manda ninguna tx", async () => {
    const c = nueva();
    guardarCotizacion(c);
    const del = copia(c);
    delete del.firma;
    vaciarMemoria();
    await expect(registrarCheque(CFG, c.id, del)).rejects.toMatchObject({ codigo: "COTIZACION_INVALIDA", status: 403 });
    expect(envios.n).toBe(0);
  });

  it("reusar el mismo id → 409 CHEQUE_YA_REGISTRADO antes de mandar la tx", async () => {
    const c = nueva();
    guardarCotizacion(c);
    await registrarCheque(CFG, c.id);
    await expect(registrarCheque(CFG, c.id)).rejects.toMatchObject({ codigo: "CHEQUE_YA_REGISTRADO", status: 409 });
    // también con la copia del cliente (otra vía para reenviar la misma cotización)
    vaciarMemoria();
    await expect(registrarCheque(CFG, c.id, copia(c))).rejects.toMatchObject({ codigo: "CHEQUE_YA_REGISTRADO", status: 409 });
    expect(envios.n).toBe(1);
  });

  it("la marca de ya usado es por contrato: tras redesplegar el fondo, el mismo id se puede registrar en el nuevo", async () => {
    const c = nueva();
    guardarCotizacion(c);
    await registrarCheque(CFG, c.id);
    const NUEVO = { ...CFG, chequeFund: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" } as unknown as ConfigChain;
    await registrarCheque(NUEVO, c.id);
    expect(envios.n).toBe(2);
    await expect(registrarCheque(NUEVO, c.id)).rejects.toMatchObject({ codigo: "CHEQUE_YA_REGISTRADO", status: 409 });
  });

  it("una pyme que no es la del servidor → 403 PYME_NO_AUTORIZADA, aun con una cotización legítima (como la que arma la ruta del agente)", async () => {
    const c = nueva(AJENA);
    guardarCotizacion(c); // firmada por el servidor, pero con pyme ajena
    await expect(registrarCheque(CFG, c.id)).rejects.toMatchObject({ codigo: "PYME_NO_AUTORIZADA", status: 403 });
    vaciarMemoria();
    await expect(registrarCheque(CFG, c.id, copia(c))).rejects.toMatchObject({ codigo: "PYME_NO_AUTORIZADA", status: 403 });
    expect(envios.n).toBe(0);
  });

  it("la pyme del servidor se compara sin distinguir mayúsculas", async () => {
    const c = nueva(PYME_SERVIDOR.toLowerCase());
    guardarCotizacion(c);
    await expect(registrarCheque(CFG, c.id)).resolves.toMatchObject({ chequeId: c.id });
  });

  it("límites del fondo: si el emisor pasaría el 10 % se rechaza con CONCENTRACION_EXCEDIDA y no se manda ninguna tx", async () => {
    const c = nueva();
    guardarCotizacion(c);
    fondo.exposicion = new Map([[c.libradorHash.toLowerCase(), 10_000_000n * UN_TOKEN]]); // ya está en el tope: cualquier compra lo pasa
    await expect(registrarCheque(CFG, c.id)).rejects.toMatchObject({ codigo: "CONCENTRACION_EXCEDIDA", status: 409 });
    expect(envios.n).toBe(0);
  });

  it("límites del fondo: en el tope exacto del 10 % se registra (el contrato compara con >)", async () => {
    const c = nueva();
    guardarCotizacion(c);
    const precio = parseUnits(c.precioCompra, 18);
    fondo.totalAssets = precio * 10n; // el precio es justo el 10 % del patrimonio
    fondo.liquidez = precio * 10n;
    await expect(registrarCheque(CFG, c.id)).resolves.toMatchObject({ chequeId: c.id });
    expect(envios.n).toBe(1);
  });

  it("límites del fondo: con el fondo vacío no se registra", async () => {
    const c = nueva();
    guardarCotizacion(c);
    fondo.totalAssets = 0n;
    fondo.liquidez = 0n;
    await expect(registrarCheque(CFG, c.id)).rejects.toMatchObject({ codigo: "CONCENTRACION_EXCEDIDA" });
    expect(envios.n).toBe(0);
  });

  it("límites del fondo: si el patrimonio alcanza pero la liquidez posterior queda bajo el 15 %, LIQUIDEZ_MINIMA", async () => {
    const c = nueva();
    guardarCotizacion(c);
    fondo.liquidez = 15_000_000n * UN_TOKEN; // el precio (~$ 1 M) la deja en ~14 % del patrimonio
    await expect(registrarCheque(CFG, c.id)).rejects.toMatchObject({ codigo: "LIQUIDEZ_MINIMA", status: 409 });
    expect(envios.n).toBe(0);
  });

  it("límites del fondo: si no se puede leer el estado, no se registra", async () => {
    const c = nueva();
    guardarCotizacion(c);
    fondo.falla = true;
    await expect(registrarCheque(CFG, c.id)).rejects.toBeDefined();
    expect(envios.n).toBe(0);
  });
});
