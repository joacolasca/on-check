// Pruebas de integración: contratos v2 REALES en una cadena local (anvil con el chain id de Base Sepolia).
// El despliegue es el del script de producción (`contracts/script/Deploy.s.sol`, vía `forge script`), contra anvil: nada toca una red real.
// Se saltean solas si falta anvil, forge o el contrato compilado (`cd contracts && forge build`).
import { createPublicClient, createWalletClient, http, parseUnits, type Account, type Address, type Chain, type Hex, type PublicClient, type Transport, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ChequeVista, Cotizacion, CuentaDemoEstado, PosicionInversor, RescateVista, ResumenFondo } from "@/shared/types";
import { ABI_FONDO, ABI_TOKEN } from "./abi";
import { ErrorApi, traducirError } from "./errores";
import { AHORA_FIJO_MS, CLAVE_DEMO, CLAVES, arrancarCadena, entornoDeApi, hayEntornoDeCadena, type Cadena } from "./testanvil";

const ENV_ORIGINAL = { ...process.env };
let cadena: Cadena | undefined;
let RPC = "";

const post = (ruta: string, body: unknown) =>
  new Request(`http://localhost${ruta}`, { method: "POST", headers: { "content-type": "application/json", "x-demo-clave": CLAVE_DEMO }, body: JSON.stringify(body) });
const json = async <T>(r: Response): Promise<T> => (await r.json()) as T;
const postVacio = () => new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json", "x-demo-clave": CLAVE_DEMO } });
const hoyMas = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
const DIA = 86_400;

const rpc = async (method: string, params: unknown[]) => {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await r.json()) as { result?: unknown; error?: unknown };
};
/** Adelanta el reloj de anvil y mina un bloque (el de la demo "adelantar tiempo"). */
const avanzarTiempo = async (segundos: number) => {
  await rpc("evm_increaseTime", [segundos]);
  await rpc("evm_mine", []);
  (await import("./estado")).invalidarEstado(); // el estado se comparte unos segundos: tras mover el reloj se vuelve a leer
};

describe.skipIf(!hayEntornoDeCadena)("capa chain y API real contra los contratos v2 (anvil, deploy del script real)", () => {
  vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

  let fondoAddr: Address;
  let tokenAddr: Address;
  let pc = null as unknown as PublicClient; // se crean en beforeAll, cuando anvil ya tiene puerto
  let wc = null as unknown as WalletClient<Transport, Chain, Account>;
  const leer = (functionName: string, args: unknown[] = []) => pc.readContract({ address: fondoAddr, abi: ABI_FONDO, functionName, args } as never);
  /** Escribe como el admin (la política de la demo es del admin del contrato). */
  const adminEscribe = async (functionName: string, args: unknown[]) => {
    const h = await wc.writeContract({ address: fondoAddr, abi: ABI_FONDO, functionName, args } as never);
    await pc.waitForTransactionReceipt({ hash: h });
  };
  /** Cotiza con el agente gestor (sin modelo): trae la industria del emisor, el tipo y la garantía. */
  const cotizarAgente = async (cuit: string, nominal: string, dias: number, extra: Record<string, unknown> = {}) => {
    const { POST } = await import("@/app/api/agente/analizar/route");
    const r = await POST(post("/api/agente/analizar", { cuit, nominal, vencimiento: hoyMas(dias), ...extra }));
    expect(r.status).toBe(200);
    const { cotizacion } = await json<{ cotizacion: Cotizacion }>(r);
    expect(cotizacion.aprobada).toBe(true);
    return cotizacion;
  };
  const registrar = async (cot: Cotizacion) => {
    const { POST } = await import("@/app/api/cheques/route");
    const r = await POST(post("/api/cheques", { cotizacionId: cot.id }));
    expect(r.status).toBe(200);
  };
  const fondear = async (id: string) => (await import("@/app/api/cheques/[id]/fondear/route")).POST(postVacio(), { params: Promise.resolve({ id }) });
  const resumen = async () => json<ResumenFondo>(await (await import("@/app/api/fondo/route")).GET());
  const errorDe = async (r: Response) => (await json<{ error: { codigo: string; mensaje: string } }>(r)).error;
  const posicion = async (cuenta: string) => json<PosicionInversor>(await (await import("@/app/api/demo/posicion/route")).GET(new Request(`http://localhost/api/demo/posicion?cuenta=${cuenta}`)));
  const simular = (functionName: string, args: unknown[], clave: Hex) =>
    pc.simulateContract({ account: privateKeyToAccount(clave), address: fondoAddr, abi: ABI_FONDO, functionName, args } as never).then(
      () => null,
      (e) => traducirError(e),
    );

  beforeAll(async () => {
    // Solo se falsea Date y avanza al ritmo real (los cachés por tiempo siguen funcionando); anvil arranca en el mismo instante.
    vi.useFakeTimers({ now: AHORA_FIJO_MS, toFake: ["Date"], shouldAdvanceTime: true });
    cadena = await arrancarCadena();
    RPC = cadena.rpc;
    fondoAddr = cadena.fondo;
    tokenAddr = cadena.token;
    pc = createPublicClient({ chain: baseSepolia, transport: http(RPC) }) as PublicClient;
    wc = createWalletClient({ account: privateKeyToAccount(CLAVES.admin), chain: baseSepolia, transport: http(RPC) });
    Object.assign(process.env, entornoDeApi(cadena));
  });

  afterAll(() => {
    vi.useRealTimers();
    cadena?.parar();
    for (const k of Object.keys(process.env)) if (!(k in ENV_ORIGINAL)) delete process.env[k];
    Object.assign(process.env, ENV_ORIGINAL);
  });

  let idPagare = "";
  let idMeli = "";
  let idCenco = "";

  it("el deploy dejó el fondo v2 vacío, con la política por defecto y los roles del gestor", async () => {
    expect(await leer("maxConcentracionBps")).toBe(1000);
    expect(await leer("maxIndustriaBps")).toBe(2500);
    expect(await leer("liquidezMinBps")).toBe(1500);
    expect(await leer("comisionAnualBps")).toBe(300);
    expect(await leer("modoDemo")).toBe(false);
    expect(await leer("chequeToken")).toBe(tokenAddr);
    const oraculo = privateKeyToAccount(CLAVES.oraculo).address;
    expect(await leer("hasRole", [await leer("GESTOR_ROLE"), oraculo])).toBe(true);
    expect(await leer("hasRole", [await leer("ORACULO_ROLE"), oraculo])).toBe(true);
    const f = await resumen();
    expect(f).toMatchObject({ totalAssets: "0", liquidez: "0", enCheques: "0", cantidadCheques: { Pending: 0, Funded: 0, Paid: 0, Rejected: 0 }, tirAnualizadaBps: null, rescatesPendientes: 0, modoDemo: false });
    expect(f.politica).toMatchObject({ maxEmisorBps: 1000, maxIndustriaBps: 2500, liquidezMinBps: 1500, comisionAnualBps: 300 });
    expect(f.direccionContrato).toBe(fondoAddr);
  });

  it("invertir sin KYC da SIN_KYC (y no gasta gas en vano); con KYC entra el pool de ~$ 100.000.000 a $ 1.000 la cuotaparte", async () => {
    const inv = await import("@/app/api/demo/invertir/route");
    await adminEscribe("setKyc", [privateKeyToAccount(CLAVES.inversor2).address, false]);
    const sin = await inv.POST(post("/api/demo/invertir", { cuenta: "inversor2", cuotapartes: "1000" }));
    expect(sin.status).toBe(403);
    expect((await errorDe(sin)).codigo).toBe("SIN_KYC");
    const kyc = await import("@/app/api/demo/kyc/route");
    expect((await kyc.POST(post("/api/demo/kyc", { cuenta: "inversor2" }))).status).toBe(200);

    // lote de negociación: mínimo 1.000 cuotapartes, de a 1
    const poca = await inv.POST(post("/api/demo/invertir", { cuenta: "inversor1", cuotapartes: "999" }));
    expect(poca.status).toBe(400);
    const e999 = await errorDe(poca);
    expect(e999.codigo).toBe("MINIMO_CUOTAPARTES");
    expect(e999.mensaje).toMatch(/1\.000 cuotapartes \(≈ \$ 1\.000\.000 al valor de hoy\)/);
    const pocoMonto = await inv.POST(post("/api/demo/invertir", { cuenta: "inversor1", monto: "999000" })); // 999 cuotapartes a $ 1.000
    expect((await errorDe(pocoMonto)).codigo).toBe("MINIMO_CUOTAPARTES");
    expect((await inv.POST(post("/api/demo/invertir", { cuenta: "inversor1", cuotapartes: "1000.5" }))).status).toBe(400);
    expect((await resumen()).totalAssets).toBe("0"); // ninguno de los rechazos movió fondos

    const a = await json<{ tx: string; shares: string; monto: string }>(await inv.POST(post("/api/demo/invertir", { cuenta: "inversor1", cuotapartes: "70000" })));
    const b = await json<{ tx: string; shares: string; monto: string }>(await inv.POST(post("/api/demo/invertir", { cuenta: "inversor2", monto: "30000000" })));
    expect(a).toMatchObject({ shares: "70000", monto: "70000000" }); // valor inicial $ 1.000 por cuotaparte, exacto
    // por monto: floor(30.000.000 / valor); entre un depósito y otro se devengó comisión, así que el valor es un pelo menor a $ 1.000
    expect(b.shares).toMatch(/^30000$|^30001$/);
    expect(Number(b.monto)).toBeGreaterThan(29_990_000);
    expect(Number(b.monto)).toBeLessThanOrEqual(30_001_000);
    const f = await resumen();
    expect(Number(f.totalAssets)).toBeCloseTo(100_000_000, -3);
    expect(f.liquidez).toBe(f.totalAssets);
    expect(Number(f.valorCuotaparte)).toBeCloseTo(1000, 2); // $ 1.000 menos la comisión ya devengada entre los dos depósitos
    expect(Number(f.cuotapartesEmitidas)).toBeCloseTo(100000, 0);
    expect(f.politica.minCuotapartes).toBe("1000");
  });

  it("registra un pagaré con garantía (el token nace en la pyme); al fondearlo el fondo es dueño del token y sube la exposición de su industria", async () => {
    const cot = await cotizarAgente("30526552659", "8000000", 90, {
      tipo: "pagare",
      garantia: { tipo: "energia", descripcion: "Turbina eólica de 2 MW (ejemplo)", valorDeclarado: "16000000", documentos: ["Factura de compra"] },
    });
    expect(cot.tipo).toBe("pagare");
    expect(cot.industria?.id).toBe(4); // energía y servicios públicos
    expect(cot.garantia?.tipo).toBe("energia");
    idPagare = cot.id;
    await registrar(cot);

    const cuentas = await import("@/app/api/demo/cuentas/route");
    const pyme = (await json<CuentaDemoEstado[]>(await cuentas.GET())).find((c) => c.id === "pyme")!;
    const dueno = () => pc.readContract({ address: tokenAddr, abi: ABI_TOKEN, functionName: "ownerOf", args: [BigInt(idPagare)] }) as Promise<Address>;
    expect(await dueno()).toBe(pyme.direccion);
    const guardado = (await leer("cheques", [idPagare])) as { tipo: number; industria: number; tipoGarantia: number; coberturaBps: number; garantiaHash: Hex; estado: number };
    expect(guardado).toMatchObject({ tipo: 1, industria: 4, tipoGarantia: 5, coberturaBps: cot.garantia!.coberturaBps, garantiaHash: cot.garantia!.garantiaHash, estado: 1 });

    expect((await fondear(idPagare)).status).toBe(200);
    expect(await dueno()).toBe(fondoAddr);
    expect((await leer("exposicionIndustria", [4])) as bigint).toBe(parseUnits(cot.precioCompra, 18));

    const { GET } = await import("@/app/api/cheques/route");
    const v = (await json<ChequeVista[]>(await GET())).find((c) => c.id === idPagare)!;
    expect(v).toMatchObject({ estado: "Funded", tipo: "pagare", industria: "Energía y servicios públicos", emisorNombre: "PAMPA ENERGIA S A", garantia: { tipo: "energia", coberturaBps: cot.garantia!.coberturaBps } });
    expect(v.txs.map((t) => t.tipo)).toEqual(["registrar", "fondear"]);
    const f = await resumen();
    expect(Number(f.totalAssets)).toBeCloseTo(100_000_000, -1); // comprar no cambia el patrimonio (~$ 100 M: ver el pool de arriba)
    expect(f.enCheques).toBe(cot.precioCompra);
    expect(f.cantidadCheques.Funded).toBe(1);
  });

  /** Registra y espera un 409 del servidor (los límites se controlan antes de mandar la tx; el contrato los repite al fondear). */
  const registroRechazado = async (cot: Cotizacion) => {
    const { POST } = await import("@/app/api/cheques/route");
    const r = await POST(post("/api/cheques", { cotizacionId: cot.id }));
    expect(r.status).toBe(409);
    return errorDe(r);
  };

  it("regla del 10 % por emisor: el segundo cheque del mismo librador, que lo supera, lo rechaza el servidor antes de la tx y no queda registrado", async () => {
    // Las dos cotizaciones se piden con el fondo todavía sin exposición (como en el Mandato, que analiza en paralelo): ambas salen aprobadas.
    const primero = await cotizarAgente("30703088534", "9000000", 60);
    const segundo = await cotizarAgente("30703088534", "4000000", 45);
    idMeli = primero.id;
    await registrar(primero);
    expect((await fondear(primero.id)).status).toBe(200);
    const e = await registroRechazado(segundo);
    expect(e.codigo).toBe("CONCENTRACION_EXCEDIDA");
    expect(e.mensaje).toMatch(/tope permitido es \$ (9\.999\.999|10\.000\.000)/); // 10 % del patrimonio (~$ 100 M, un pelo menos por la comisión entre los dos depósitos)
    const { GET } = await import("@/app/api/cheques/route");
    expect((await json<ChequeVista[]>(await GET())).find((c) => c.id === segundo.id)).toBeUndefined();
    // Y si se vuelve a analizar con la cartera de ahora, el gestor ya lo rechaza (mismo motivo, antes de cotizar la compra).
    const { POST } = await import("@/app/api/agente/analizar/route");
    const nuevo = await json<{ cotizacion: Cotizacion }>(await POST(post("/api/agente/analizar", { cuit: "30703088534", nominal: "4000000", vencimiento: hoyMas(45) })));
    expect(nuevo.cotizacion.aprobada).toBe(false);
    expect(nuevo.cotizacion.motivoRechazo).toMatch(/El emisor quedaría en .* por encima del tope de 10 %/);
    (await import("@/app/api/_lib/acceso")).reiniciarLimites();
  });

  it("regla del 25 % por industria: con el tope del contrato en 15 %, dos supermercados superan la industria y el servidor lo rechaza", async () => {
    await adminEscribe("setMaxIndustriaBps", [1500]); // la política es del admin: se baja para ejercitar la regla con los emisores de la demo
    const coto = await cotizarAgente("30548083156", "9000000", 30);
    await registrar(coto);
    expect((await fondear(coto.id)).status).toBe(200);
    const cenco = await cotizarAgente("30590360763", "9000000", 60); // el gestor usa el 25 % de la política: lo aprueba; el servidor lee el tope vigente del contrato
    idCenco = cenco.id;
    const e = await registroRechazado(cenco);
    expect(e.codigo).toBe("INDUSTRIA_EXCEDIDA");
    expect(e.mensaje).toMatch(/Comercio minorista y consumo masivo/);
    await adminEscribe("setMaxIndustriaBps", [2500]);
    await registrar(cenco); // con el 25 % real entra
    expect((await fondear(cenco.id)).status).toBe(200);
    expect((await leer("exposicionIndustria", [1])) as bigint).toBeGreaterThan(0n);
  });

  it("liquidez mínima: con la reserva exigida muy alta, el servidor no deja comprar más", async () => {
    await adminEscribe("setLiquidezMinBps", [9000]);
    const cot = await cotizarAgente("30639453738", "3000000", 90);
    const e = await registroRechazado(cot);
    expect(e.codigo).toBe("LIQUIDEZ_MINIMA");
    expect(e.mensaje).toMatch(/liquidez/);
    await adminEscribe("setLiquidezMinBps", [1500]);
    await registrar(cot);
    expect((await fondear(cot.id)).status).toBe(200); // con el 15 % real entra
    (await import("@/app/api/_lib/acceso")).reiniciarLimites();
  });

  it("la cartera para el agente trae exposición por librador, por industria (clave = id) y liquidez reales", async () => {
    const { leerCartera, leerConfig } = await import("@/lib/chain");
    const c = await leerCartera(leerConfig());
    expect(Number(c.totalAssets)).toBeCloseTo(100_000_000, -1);
    expect(Number(c.liquidez)).toBeGreaterThan(50_000_000);
    expect(Object.keys(c.exposicionPorIndustria).sort()).toEqual(["1", "2", "3", "4"]);
    expect(Object.keys(c.exposicionPorLibrador)).toHaveLength(5);
    const energia = (await leer("exposicionIndustria", [4])) as bigint;
    expect(parseUnits(c.exposicionPorIndustria["4"], 18)).toBe(energia);
  });

  it("GET /api/fondo devuelve una composición coherente: por emisor, industria y tipo suman 10000 bps", async () => {
    const f = await resumen();
    expect(f.cantidadCheques.Funded).toBe(5);
    for (const parte of [f.composicion.porEmisor, f.composicion.porIndustria, f.composicion.porTipo]) {
      expect(parte.reduce((s, p) => s + p.bps, 0)).toBe(10_000);
    }
    expect(f.composicion.porEmisor).toHaveLength(5);
    expect(f.composicion.porEmisor.map((p) => p.etiqueta)).toContain("PAMPA ENERGIA S A");
    expect(f.composicion.porIndustria.map((p) => p.etiqueta)).toContain("Energía y servicios públicos");
    expect(f.composicion.porTipo.map((p) => p.clave).sort()).toEqual(["cheque", "pagare"]);
    expect(f.liquidezBps).toBeGreaterThan(1500);
    expect(f.concentracionMaxBps).toBeLessThanOrEqual(1000);
  });

  it("pagar sube la cuotaparte y deja TIR; rechazar muestra la pérdida; la exposición y el token se limpian", async () => {
    const liquidar = await import("@/app/api/demo/liquidar/route");
    expect((await liquidar.POST(post("/api/demo/liquidar", { chequeId: idPagare, resultado: "pagado" }))).status).toBe(200);
    let f = await resumen();
    expect(f.cantidadCheques.Paid).toBe(1);
    expect(Number(f.valorCuotaparte)).toBeGreaterThan(1000);
    expect(f.tirAnualizadaBps).not.toBeNull();
    expect((await leer("exposicionIndustria", [4])) as bigint).toBe(0n);
    const quemado = await pc.readContract({ address: tokenAddr, abi: ABI_TOKEN, functionName: "ownerOf", args: [BigInt(idPagare)] }).then(
      () => false,
      () => true,
    );
    expect(quemado).toBe(true); // el token se quema al cobrarse

    expect((await liquidar.POST(post("/api/demo/liquidar", { chequeId: idCenco, resultado: "rechazado" }))).status).toBe(200);
    f = await resumen();
    expect(f.rechazos.cantidad).toBe(1);
    expect(Number(f.rechazos.perdida)).toBeGreaterThan(8_000_000);
    expect(f.cantidadCheques.Rejected).toBe(1);
    // el token del rechazado queda en el fondo
    expect(await pc.readContract({ address: tokenAddr, abi: ABI_TOKEN, functionName: "ownerOf", args: [BigInt(idCenco)] })).toBe(fondoAddr);
    expect(idMeli).not.toBe("");
  });

  it("la comisión se devenga día a día: 30 días después hay ~0,25 % del fondo en cuotapartes del receptor", async () => {
    const antes = await resumen();
    await avanzarTiempo(30 * DIA);
    const f = await resumen();
    const devengada = Number(f.comision.devengadaCuotapartes);
    expect(devengada).toBeGreaterThan(Number(antes.comision.devengadaCuotapartes));
    const supply = Number(f.cuotapartesEmitidas) + Number(f.comision.devengadaCuotapartes) - Number(antes.comision.devengadaCuotapartes);
    expect(devengada / supply).toBeGreaterThan(0.0022); // 3 % × 30/365 ≈ 0,247 %
    expect(devengada / supply).toBeLessThan(0.0027);
    expect(Number(f.comision.devengadaPesos)).toBeGreaterThan(0);
  });

  describe("rescates", () => {
    let rescateId = "";

    it("solicitar: las cuotapartes quedan en custodia, el rescate figura Pendiente y aún no se puede liquidar (el contrato lo revierte)", async () => {
      const { POST } = await import("@/app/api/demo/rescates/route");
      const antes = await posicion("inversor1");
      const r = await POST(post("/api/demo/rescates", { cuenta: "inversor1", cuotapartes: "1000" }));
      expect(r.status).toBe(200);
      const { rescate } = await json<{ tx: string; rescate: RescateVista }>(r);
      rescateId = rescate.id;
      expect(rescate).toMatchObject({ estado: "Pendiente", cuotapartes: "1000", monto: null });
      expect(Date.parse(rescate.liquidableDesde)).toBeGreaterThan(Date.parse(rescate.solicitadoEn));

      const pos = await posicion("inversor1");
      expect(Number(pos.cuotapartes)).toBe(Number(antes.cuotapartes) - 1000);
      expect(pos.rescates.map((x) => x.id)).toContain(rescateId);
      expect((await resumen()).rescatesPendientes).toBe(1);

      // el gestor (wallet del oráculo) no puede liquidar antes del plazo: el contrato revierte con RescateNoVencido
      const intento = await simular("liquidarRescate", [BigInt(rescateId)], CLAVES.oraculo);
      expect(intento).toBeInstanceOf(ErrorApi);
      expect(intento?.codigo).toBe("RESCATE_NO_VENCIDO");
      // y nadie más puede liquidar
      expect((await simular("liquidarRescate", [BigInt(rescateId)], CLAVES.inversor1))?.codigo).toBe("CONFIGURACION");

      // el endpoint del gestor lo deja pendiente y lo explica
      const liq = await import("@/app/api/demo/rescates/liquidar/route");
      const sinPlazo = await json<{ liquidados: unknown[]; pendientesNoVencidos: number }>(await liq.POST(postVacio()));
      expect(sinPlazo.liquidados).toHaveLength(0);
      expect(sinPlazo.pendientesNoVencidos).toBe(1);
    });

    it("pasado el plazo (evm_increaseTime) el gestor liquida al valor de la cuotaparte del momento y la posición baja", async () => {
      await avanzarTiempo(4 * DIA); // cubre fin de semana y el corte de las 15 hs
      const f0 = await resumen();
      const liq = await import("@/app/api/demo/rescates/liquidar/route");
      const r = await json<{ liquidados: { id: string; monto: string; cuotapartes: string }[]; explicacionGestor: string }>(await liq.POST(postVacio()));
      expect(r.liquidados.map((x) => x.id)).toEqual([rescateId]);
      const pagado = Number(r.liquidados[0].monto);
      // ≈ 1000 cuotapartes × valor de la cuotaparte (la comisión de esos días lo corre apenas)
      expect(pagado).toBeGreaterThan(1000 * Number(f0.valorCuotaparte) * 0.99);
      expect(pagado).toBeLessThan(1000 * Number(f0.valorCuotaparte) * 1.01);
      expect(r.explicacionGestor.length).toBeGreaterThan(20);
      const rescates = await json<RescateVista[]>(await (await import("@/app/api/rescates/route")).GET(new Request("http://localhost/api/rescates")));
      expect(rescates.find((x) => x.id === rescateId)).toMatchObject({ estado: "Liquidado", monto: r.liquidados[0].monto });
      const f = await resumen();
      expect(f.rescatesPendientes).toBe(0);
      expect(Number(f.cuotapartesEmitidas)).toBeLessThan(Number(f0.cuotapartesEmitidas) + 1);
      // un rescate ya liquidado no se puede volver a liquidar
      expect((await simular("liquidarRescate", [BigInt(rescateId)], CLAVES.oraculo))?.codigo).toBe("RESCATE_NO_PENDIENTE");
    });

    it("con modoDemo el gestor liquida enseguida (lo prende el admin por la API)", async () => {
      const modo = await import("@/app/api/demo/modo/route");
      const m = await json<{ modoDemo: boolean }>(await modo.POST(post("/api/demo/modo", { activo: true })));
      expect(m.modoDemo).toBe(true);
      expect((await resumen()).modoDemo).toBe(true);
      const { POST } = await import("@/app/api/demo/rescates/route");
      const s = await json<{ rescate: RescateVista }>(await POST(post("/api/demo/rescates", { cuenta: "inversor2", cuotapartes: "500" })));
      const liq = await import("@/app/api/demo/rescates/liquidar/route");
      const r = await json<{ liquidados: { id: string }[]; modoDemo: boolean }>(await liq.POST(postVacio()));
      expect(r.modoDemo).toBe(true);
      expect(r.liquidados.map((x) => x.id)).toEqual([s.rescate.id]);
      await modo.POST(post("/api/demo/modo", { activo: false }));
      expect((await resumen()).modoDemo).toBe(false);
    });

    it("rescatar más cuotapartes de las que se tienen da CUOTAPARTES_INSUFICIENTES", async () => {
      const { POST } = await import("@/app/api/demo/rescates/route");
      const r = await POST(post("/api/demo/rescates", { cuenta: "inversor2", cuotapartes: "999999999" }));
      expect(r.status).toBe(409);
      expect((await errorDe(r)).codigo).toBe("CUOTAPARTES_INSUFICIENTES");
    });
  });

  it("cotización firmada: reuso del id → 409, sin firma → 403 y pyme ajena → 403 (sin registrar nada nuevo)", async () => {
    const cheques = await import("@/app/api/cheques/route");
    const { guardarCotizacion } = await import("@/lib/chain");
    const cotizarRuta = await import("@/app/api/cotizar/route");
    (await import("@/app/api/_lib/acceso")).reiniciarLimites();
    const reuso = await cheques.POST(post("/api/cheques", { cotizacionId: idMeli }));
    expect(reuso.status).toBe(409);
    expect((await errorDe(reuso)).codigo).toBe("CHEQUE_YA_REGISTRADO");
    const cot = await json<Cotizacion>(await cotizarRuta.POST(post("/api/cotizar", { cuit: "30548083156", nominal: "1000000", vencimiento: hoyMas(20) })));
    expect(cot.firma).toMatch(/^\d+\.[0-9a-f]{64}$/);
    (globalThis as unknown as { __cotizaciones: Map<string, unknown> }).__cotizaciones.clear();
    const { firma: _f, ...sinFirma } = cot;
    void _f;
    const sin = await cheques.POST(post("/api/cheques", { cotizacionId: cot.id, cotizacion: sinFirma }));
    expect(sin.status).toBe(403);
    expect((await errorDe(sin)).codigo).toBe("COTIZACION_INVALIDA");
    const { cotizar: armar, scoreLibrador } = await import("@/lib/scoring");
    const { CONFIG_FONDO } = await import("@/lib/scoring/config");
    const ajena = armar({ cuit: "30548083156", nominal: "1100000", vencimiento: hoyMas(20), pyme: "0x00000000000000000000000000000000000000Aa" }, await scoreLibrador("30548083156"), CONFIG_FONDO);
    guardarCotizacion(ajena);
    const rp = await cheques.POST(post("/api/cheques", { cotizacionId: ajena.id }));
    expect(rp.status).toBe(403);
    expect((await errorDe(rp)).codigo).toBe("PYME_NO_AUTORIZADA");
  });

  it("registrar una cotización que no existe da 404, una rechazada da 422 y liquidar un cheque inexistente da 404", async () => {
    const cheques = await import("@/app/api/cheques/route");
    const r = await cheques.POST(post("/api/cheques", { cotizacionId: "0x" + "ab".repeat(32) }));
    expect(r.status).toBe(404);
    expect((await errorDe(r)).codigo).toBe("COTIZACION_NO_ENCONTRADA");
    const cotizar = await import("@/app/api/cotizar/route");
    const mala = await json<Cotizacion>(await cotizar.POST(post("/api/cotizar", { cuit: "30703088534", nominal: "10000000", vencimiento: hoyMas(200) })));
    expect(mala.aprobada).toBe(false);
    const r2 = await cheques.POST(post("/api/cheques", { cotizacionId: mala.id }));
    expect(r2.status).toBe(422);
    expect((await errorDe(r2)).codigo).toBe("COTIZACION_RECHAZADA");
    const liquidar = await import("@/app/api/demo/liquidar/route");
    expect((await liquidar.POST(post("/api/demo/liquidar", { chequeId: "0x" + "cd".repeat(32), resultado: "pagado" }))).status).toBe(404);
  });

  it("GET /api/argt-real devuelve error claro si no se puede leer mainnet (sin red)", async () => {
    vi.stubEnv("BASE_MAINNET_RPC_URL", "http://127.0.0.1:1");
    const { GET } = await import("@/app/api/argt-real/route");
    const r = await GET();
    vi.unstubAllEnvs();
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect((await errorDe(r)).codigo).toBe("ARGT_NO_DISPONIBLE");
  });
});

describe("sin contrato configurado y con API_MODE=mock, la API responde con datos de prueba", () => {
  it("GET /api/fondo y /api/cheques son el mock", async () => {
    const guardado = { ...process.env };
    delete process.env.CHEQUE_FUND_ADDRESS;
    process.env.API_MODE = "mock"; // los datos de prueba son solo para API_MODE=mock
    const f = await json<ResumenFondo>(await (await import("@/app/api/fondo/route")).GET());
    expect(f.direccionContrato).toBe("0x0000000000000000000000000000000000000000");
    const c = await json<ChequeVista[]>(await (await import("@/app/api/cheques/route")).GET());
    expect(c.length).toBe(7);
    Object.assign(process.env, guardado);
  });
});
