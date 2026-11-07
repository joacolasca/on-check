import { describe, expect, it, vi } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ConfigFondo, InputCotizacion } from "@/shared/types";
import { CUITS_EN_CACHE } from "./cache";
import { consultarBcra, cuitValido, normalizar, TIMEOUT_BCRA_MS } from "./bcra";
import { CuitInvalidoError, CuitSinDatosError, type DatosBcra, type EntidadDeuda } from "./bcra-tipos";
import { CONFIG_FONDO, PUNTAJE_MINIMO, SPREAD_POR_PUNTO_BPS, TASA_MAX_BPS, TASA_MIN_BPS, tasaPorPuntaje } from "./config";
import { antecedentesCheques } from "./antecedentes";
import { canonico, cotizar, hashLibrador } from "./cotizar";
import { aCentavos, deCentavos, mulDiv } from "./dinero";
import { bandaDe, calcularPuntaje } from "./puntaje";
import { scoreLibrador } from "./index";

const HOY = new Date("2026-11-03T15:00:00Z");
const ent = (situacion: number, extra: Partial<EntidadDeuda> = {}): EntidadDeuda => ({ entidad: "BANCO X", situacion, monto: 100, refinanciaciones: false, ...extra });
const datos = (cambios: Partial<DatosBcra> = {}): DatosBcra => ({
  cuit: "30703088534", denominacion: "EMPRESA S.A.", entidadesActuales: [ent(1)], deudaPorPeriodo: [], rechazados: [],
  fuente: "bcra-cache", consultadoEn: "2026-11-03T12:00:00.000Z", ...cambios,
});
const serie = (...totales: number[]) => totales.map((total, i) => ({ periodo: String(202609 - i), total }));

describe("dinero", () => {
  it("convierte sin number y redondea half-up", () => {
    expect(aCentavos("10000000")).toBe(1_000_000_000n);
    expect(aCentavos("1.005")).toBe(101n);
    expect(deCentavos(42838356n)).toBe("428383.56");
    expect(deCentavos(100n)).toBe("1");
    expect(deCentavos(150n)).toBe("1.5");
    expect(mulDiv(1000n, 1n, 3n)).toBe(333n);
    expect(mulDiv(1000n, 2n, 3n)).toBe(667n);
  });
});

describe("bandas", () => {
  it("respetan los bordes A ≥ 85, B 70–84, C 55–69, D < 55", () => {
    expect([100, 85, 84, 70, 69, 55, 54, 0].map(bandaDe)).toEqual(["A", "A", "B", "B", "C", "C", "D", "D"]);
  });
});

describe("reglas de puntaje", () => {
  it("sin problemas: 100 y banda A", () => {
    const r = calcularPuntaje(datos(), HOY);
    expect(r).toMatchObject({ puntaje: 100, banda: "A", situacionPeor: 1, chequesRechazadosImpagos: 0, refinanciaciones: false, deudaCreciente: false, ajustes: [] });
  });
  it("−15 por cada nivel de situación peor que 1, tomando la peor entidad", () => {
    const r = calcularPuntaje(datos({ entidadesActuales: [ent(1), ent(3, { entidad: "BANCO PEOR" })] }), HOY);
    expect(r.puntaje).toBe(70);
    expect(r.situacionPeor).toBe(3);
    expect(r.ajustes[0]).toEqual({ motivo: "Situación 3 en BANCO PEOR", puntos: -30 });
  });
  it("ignora las entidades con situación 0 (sin deuda en el período)", () => {
    expect(calcularPuntaje(datos({ entidadesActuales: [ent(0), ent(1)] }), HOY).puntaje).toBe(100);
  });
  it("−25 por cheques rechazados sin pagar en los últimos 12 meses", () => {
    const r = calcularPuntaje(datos({ rechazados: [{ fechaRechazo: "2026-05-10", causal: "SIN FONDOS", impago: true }] }), HOY);
    expect(r.puntaje).toBe(75);
    expect(r.chequesRechazadosImpagos).toBe(1);
  });
  it("no cuenta los rechazos viejos, los pagados ni los defectos formales", () => {
    const r = calcularPuntaje(datos({ rechazados: [
      { fechaRechazo: "2025-02-13", causal: "SIN FONDOS", impago: true }, // fuera de la ventana
      { fechaRechazo: "2026-05-10", causal: "SIN FONDOS", impago: false }, // pagado
      { fechaRechazo: "2026-05-10", causal: "DEFECTOS FORMALES", impago: true }, // no refleja capacidad de pago
    ] }), HOY);
    expect(r.chequesRechazadosImpagos).toBe(0);
    expect(r.puntaje).toBe(100);
    // 2 notas de 0 puntos: el antecedente sin penalización (pagado / defectos formales) y la exclusión por el impago viejo (la aplica cotizar)
    expect(r.ajustes).toHaveLength(2);
    expect(r.ajustes.every((a) => a.puntos === 0)).toBe(true);
  });
  it("el borde de la ventana: exactamente 12 meses atrás todavía cuenta", () => {
    const r = calcularPuntaje(datos({ rechazados: [{ fechaRechazo: "2025-11-03", causal: "SIN FONDOS", impago: true }] }), HOY);
    expect(r.chequesRechazadosImpagos).toBe(1);
  });
  it("−10 por refinanciaciones", () => {
    const r = calcularPuntaje(datos({ entidadesActuales: [ent(1, { refinanciaciones: true })] }), HOY);
    expect(r.puntaje).toBe(90);
    expect(r.refinanciaciones).toBe(true);
  });
  it("−5 si la deuda creció más de 10 % respecto de hace 6 meses", () => {
    expect(calcularPuntaje(datos({ deudaPorPeriodo: serie(120, 0, 0, 0, 0, 0, 100) }), HOY).deudaCreciente).toBe(true);
    expect(calcularPuntaje(datos({ deudaPorPeriodo: serie(110, 0, 0, 0, 0, 0, 100) }), HOY).deudaCreciente).toBe(false); // justo 10 %: no
    expect(calcularPuntaje(datos({ deudaPorPeriodo: serie(120, 0) }), HOY).deudaCreciente).toBe(false); // sin histórico suficiente
  });
  it("suma todos los ajustes y nunca baja de 0", () => {
    const r = calcularPuntaje(datos({
      entidadesActuales: [ent(5, { refinanciaciones: true })],
      rechazados: [{ fechaRechazo: "2026-05-10", causal: "SIN FONDOS", impago: true }],
      deudaPorPeriodo: serie(200, 0, 0, 0, 0, 0, 100),
    }), HOY);
    expect(r.puntaje).toBe(0);
    expect(r.banda).toBe("D");
  });
});

describe("cliente del BCRA", () => {
  const ok = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: 200 });
  const deudas = { results: { identificacion: 1, denominacion: "EMPRESA", periodos: [{ periodo: "202609", entidades: [{ entidad: "B", situacion: 1, monto: 5, refinanciaciones: false }] }] } };
  const historicas = { results: { periodos: [{ periodo: "202609", entidades: [{ monto: 5 }] }] } };

  function enrutar(r: { deudas?: Response; hist?: Response; rech?: Response }) {
    return vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("ChequesRechazados")) return r.rech ?? new Response('{"status":404}', { status: 404 });
      if (u.includes("Historicas")) return r.hist ?? ok(historicas);
      return r.deudas ?? ok(deudas);
    }) as unknown as typeof fetch;
  }

  it("en vivo: normaliza y trata el 404 de cheques rechazados como 'sin rechazos'", async () => {
    const d = await consultarBcra("30111111118", { fetchFn: enrutar({}), ahora: HOY });
    expect(d.fuente).toBe("bcra-live");
    expect(d.rechazados).toEqual([]);
    expect(d.denominacion).toBe("EMPRESA");
  });
  it("un CUIT que el BCRA no conoce es un error definitivo (no cae a la copia)", async () => {
    const f = enrutar({ deudas: new Response("{}", { status: 404 }) });
    await expect(consultarBcra("30703088534", { fetchFn: f })).rejects.toBeInstanceOf(CuitSinDatosError);
  });
  it("si el BCRA falla, usa la copia guardada (D12)", async () => {
    const f = vi.fn(async () => { throw new TypeError("sin red"); }) as unknown as typeof fetch;
    const d = await consultarBcra("30703088534", { fetchFn: f });
    expect(d.fuente).toBe("bcra-cache");
    expect(d.denominacion).toBe("MERCADOLIBRE S.R.L.");
  });
  it("si el BCRA responde 5xx, también cae a la copia", async () => {
    const f = enrutar({ deudas: new Response("", { status: 503 }) });
    expect((await consultarBcra("30548083156", { fetchFn: f })).fuente).toBe("bcra-cache");
  });
  it("si tarda más del timeout, cae a la copia", async () => {
    const f = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("timeout", "AbortError"))))) as unknown as typeof fetch;
    const t0 = Date.now();
    const d = await consultarBcra("30590360763", { fetchFn: f, timeoutMs: 30 });
    expect(d.fuente).toBe("bcra-cache");
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(TIMEOUT_BCRA_MS).toBe(3000);
  });
  it("sin red y sin copia, falla con un mensaje claro", async () => {
    const f = vi.fn(async () => { throw new TypeError("sin red"); }) as unknown as typeof fetch;
    await expect(consultarBcra("30111111118", { fetchFn: f })).rejects.toThrow(/no hay copia guardada/);
  });
  it("modo 'live' no usa la copia y modo 'cache' no usa la red", async () => {
    const roto = vi.fn(async () => { throw new TypeError("sin red"); }) as unknown as typeof fetch;
    await expect(consultarBcra("30703088534", { fetchFn: roto, modo: "live" })).rejects.toThrow();
    const nunca = vi.fn() as unknown as typeof fetch;
    const d = await consultarBcra("30703088534", { fetchFn: nunca, modo: "cache" });
    expect(d.fuente).toBe("bcra-cache");
    expect(nunca).not.toHaveBeenCalled();
  });
  it("la caché tiene todos los archivos de shared/fixtures/bcra", () => {
    const carpeta = fileURLToPath(new URL("../../../shared/fixtures/bcra/", import.meta.url));
    const archivos = readdirSync(carpeta).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", "")).sort();
    expect([...CUITS_EN_CACHE].sort()).toEqual(archivos);
  });
  it("normalizar tolera respuestas vacías", () => {
    const d = normalizar("1", null, null, null, "bcra-live", "2026-11-03T00:00:00.000Z");
    expect(d.entidadesActuales).toEqual([]);
    expect(calcularPuntaje(d, HOY).puntaje).toBe(100);
  });
});

describe("los 5 CUITs de demo con datos reales del BCRA (copia guardada)", () => {
  const esperado: Record<string, { nombre: string; rechazosVigentes: number }> = {
    "30703088534": { nombre: "MERCADOLIBRE S.R.L.", rechazosVigentes: 0 },
    "30548083156": { nombre: "COTO CENTRO INTEGRAL DE COMERCIALIZACION SA", rechazosVigentes: 0 },
    "30590360763": { nombre: "CENCOSUD S A", rechazosVigentes: 0 },
    "30526552659": { nombre: "PAMPA ENERGIA S A", rechazosVigentes: 0 },
    "30639453738": { nombre: "TELECOM ARGENTINA SOCIEDAD ANONIMA", rechazosVigentes: 0 },
  };
  for (const [cuit, e] of Object.entries(esperado)) {
    it(`${e.nombre} es banda A (situación 1) y coincide con el nombre del BCRA`, async () => {
      const r = await scoreLibrador(cuit, { modo: "cache" });
      expect(r.denominacion?.startsWith(e.nombre.slice(0, 20))).toBe(true);
      expect(r.situacionPeor).toBe(1);
      expect(r.chequesRechazadosImpagos).toBe(e.rechazosVigentes);
      expect(r.banda).toBe("A");
      expect(r.fuente).toBe("bcra-cache");
    });
  }
  it("Telecom: el rechazo de feb-2025 es por defectos formales y está fuera de la ventana: no penaliza", async () => {
    const r = await scoreLibrador("30639453738", { modo: "cache" });
    expect(r.ajustes.reduce((s, a) => s + a.puntos, 0)).toBe(0); // sin penalización...
    expect(r.ajustes).toHaveLength(1); // ...pero el antecedente se informa
    expect(r.ajustes[0].motivo).toMatch(/13\/2\/2025.*defectos formales/);
    expect(r.puntaje).toBe(100);
  });
});

describe("cotizar", () => {
  const input: InputCotizacion = { cuit: "30-70308853-4", nominal: "10000000", vencimiento: "2027-01-02", pyme: "0x0000000000000000000000000000000000000001" };
  const scoringA = calcularPuntaje(datos(), HOY);
  const salt = "sal-de-prueba";

  it("calcula el descuento comercial: nominal × tasa × días / 365 (D13) con TAMAR + spread por puntaje (puntaje 100 → piso del 30 %)", () => {
    const c = cotizar(input, scoringA, CONFIG_FONDO, HOY, salt);
    expect(c.dias).toBe(60);
    expect(c.tasaTnaBps).toBe(3000); // TAMAR 2406 + 0 de spread = 2406, llevada al piso de 3000
    expect(c.descuento).toBe("493150.68"); // 10.000.000 × 0,30 × 60 / 365
    expect(c.precioCompra).toBe("9506849.32");
    expect(c.aprobada).toBe(true);
    expect(c.motivoRechazo).toBeNull();
  });
  it("el CUIT se normaliza y nunca va en claro en el hash del librador (D9)", () => {
    const c = cotizar(input, scoringA, CONFIG_FONDO, HOY, salt);
    expect(c.input.cuit).toBe("30703088534");
    expect(c.libradorHash).toBe(hashLibrador("30703088534", salt));
    expect(c.libradorHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(c.libradorHash).not.toContain("30703088534");
    expect(hashLibrador("30703088534", "otra-sal")).not.toBe(c.libradorHash);
  });
  it("id y cotizacionHash: formato correcto, reproducibles y sensibles a cualquier cambio", () => {
    const a = cotizar(input, scoringA, CONFIG_FONDO, HOY, salt);
    const b = cotizar(input, scoringA, CONFIG_FONDO, HOY, salt);
    expect(a.id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a.cotizacionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(b.id).toBe(a.id);
    expect(b.cotizacionHash).toBe(a.cotizacionHash);
    expect(cotizar({ ...input, nominal: "10000001" }, scoringA, CONFIG_FONDO, HOY, salt).id).not.toBe(a.id);
    expect(a.cotizacionHash).not.toBe(cotizar({ ...input, pyme: "0x0000000000000000000000000000000000000002" }, scoringA, CONFIG_FONDO, HOY, salt).cotizacionHash);
  });
  it("el hash es el keccak256 del JSON canónico sin el propio hash (D8): cambiar la explicación lo cambia", async () => {
    const { keccak256, toBytes } = await import("viem");
    const c = cotizar(input, scoringA, CONFIG_FONDO, HOY, salt);
    const { cotizacionHash, ...sin } = c;
    expect(cotizacionHash).toBe(keccak256(toBytes(canonico(sin))));
    expect(keccak256(toBytes(canonico({ ...sin, explicacion: "texto cambiado" })))).not.toBe(cotizacionHash);
  });
  it("banda D: no se compra", () => {
    const d = calcularPuntaje(datos({ entidadesActuales: [ent(5)] }), HOY);
    const c = cotizar(input, d, CONFIG_FONDO, HOY, salt);
    expect(c.aprobada).toBe(false);
    expect(c.motivoRechazo).toMatch(/puntaje.*40\/100.*mínimo.*70/);
    expect(c.precioCompra).toBe("0");
    expect(c.tasaTnaBps).toBe(0);
  });
  it("rechaza plazo mayor al máximo, vencido y montos fuera de rango", () => {
    const f = (cambios: Partial<InputCotizacion>) => cotizar({ ...input, ...cambios }, scoringA, CONFIG_FONDO, HOY, salt);
    expect(f({ vencimiento: "2027-03-01" }).motivoRechazo).toMatch(/plazo/);
    expect(f({ vencimiento: "2026-11-03" }).motivoRechazo).toMatch(/venció/);
    expect(f({ vencimiento: "2026-10-01" }).aprobada).toBe(false);
    expect(f({ nominal: "999999" }).motivoRechazo).toMatch(/mínimo/);
    expect(f({ nominal: "50000001" }).motivoRechazo).toMatch(/máximo/);
    expect(f({ nominal: "50000000" }).aprobada).toBe(true);
  });
  it("el plazo máximo (90 días) todavía se acepta", () => {
    expect(cotizar({ ...input, vencimiento: "2027-02-01" }, scoringA, CONFIG_FONDO, HOY, salt).aprobada).toBe(true); // 90 días
    expect(cotizar({ ...input, vencimiento: "2027-02-02" }, scoringA, CONFIG_FONDO, HOY, salt).aprobada).toBe(false); // 91
  });
  it("la tasa sube cuando baja el puntaje (B) y la banda C (55–69) ya no se compra", () => {
    const b = calcularPuntaje(datos({ entidadesActuales: [ent(2, { refinanciaciones: true })] }), HOY); // 100 − 15 − 10 = 75 (los impagos ya no se compran, sea cual sea el puntaje)
    expect(b.banda).toBe("B");
    expect(cotizar(input, b, CONFIG_FONDO, HOY, salt).tasaTnaBps).toBe(2406 + 25 * 120); // 5406
    const c = calcularPuntaje(datos({ entidadesActuales: [ent(3)] }), HOY); // 70 → B, justo en el mínimo
    expect(c.puntaje).toBe(70);
    expect(cotizar(input, c, CONFIG_FONDO, HOY, salt).tasaTnaBps).toBe(6000); // 2406 + 3600 = 6006 → tope
    const cc = calcularPuntaje(datos({ entidadesActuales: [ent(3, { refinanciaciones: true })] }), HOY);
    expect(cc.banda).toBe("C");
    const r = cotizar(input, cc, CONFIG_FONDO, HOY, salt);
    expect(r.aprobada).toBe(false);
    expect(r.tasaTnaBps).toBe(0);
  });
  it("un antecedente sin penalización aparece en la explicación sin restar puntos", () => {
    const s = calcularPuntaje(datos({ rechazados: [{ fechaRechazo: "2025-02-13", causal: "DEFECTOS FORMALES", impago: true }] }), HOY);
    const t = cotizar(input, s, CONFIG_FONDO, HOY, salt).explicacion;
    expect(t).toMatch(/Antecedente sin penalización/);
    expect(t).not.toMatch(/Se restaron puntos/);
    expect(s.puntaje).toBe(100);
  });
  it("la explicación nunca dice 'rinde' ni 'rendimiento garantizado' y menciona la fuente de la tasa", () => {
    const todas = [scoringA, calcularPuntaje(datos({ entidadesActuales: [ent(5)] }), HOY), calcularPuntaje(datos({ entidadesActuales: [ent(2, { refinanciaciones: true })] }), HOY)]
      .map((s) => cotizar(input, s, CONFIG_FONDO, HOY, salt).explicacion);
    for (const t of todas) expect(t).not.toMatch(/rinde|rendimiento garantizado/i);
    expect(todas[0]).toMatch(/TAMAR 24,06 %/);
    expect(todas[2]).toMatch(/se restaron puntos/i);
  });
  it("sin CUIT_SALT usa una sal de desarrollo (no revienta)", () => {
    expect(cotizar(input, scoringA, CONFIG_FONDO, HOY).libradorHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("la configuración por defecto usa el TAMAR real del 30-10-2026", () => {
    const cfg: ConfigFondo = CONFIG_FONDO;
    expect(cfg.tamarTnaBps).toBe(2406);
    expect(cfg.plazoMaxDias).toBe(90);
  });
});

// Bordes encontrados con CUITs reales del BCRA (3-11-2026). Ver docs/NOTAS.md, sección "Scoring: CUITs reales".
describe("bordes con datos reales del BCRA", () => {
  it("YPF: una situación 5 en una entidad con 0,00 % de la deuda no la manda a banda D", () => {
    const r = calcularPuntaje(datos({ entidadesActuales: [ent(1, { monto: 1_109_978_654 }), ent(5, { entidad: "TELEPEAJE S.A.", monto: 86 })] }), HOY);
    expect(r.puntaje).toBe(100);
    expect(r.banda).toBe("A");
    expect(r.situacionPeor).toBe(1);
    expect(r.ajustes).toHaveLength(1);
    expect(r.ajustes[0].puntos).toBe(0);
    expect(r.ajustes[0].motivo).toContain("TELEPEAJE S.A.");
  });
  it("FUTBOL Y ALGO MAS SRL: situación 3 con el 1,17 % de la deuda (BANCO COMAFI) sí resta 30 → banda C", () => {
    const r = calcularPuntaje(datos({ entidadesActuales: [ent(1, { monto: 28405 }), ent(3, { entidad: "BANCO COMAFI SOCIEDAD ANONIMA", monto: 337 })], deudaPorPeriodo: serie(28742, 0, 0, 0, 0, 0, 20000) }), HOY);
    expect(r).toMatchObject({ puntaje: 65, banda: "C", situacionPeor: 3, deudaCreciente: true });
    expect(r.ajustes.map((a) => a.puntos)).toEqual([-30, -5]);
  });
  it("la materialidad es 1 %: justo 1 % sí resta, 0,99 % no", () => {
    expect(calcularPuntaje(datos({ entidadesActuales: [ent(1, { monto: 9900 }), ent(5, { monto: 100 })] }), HOY).puntaje).toBe(40);
    expect(calcularPuntaje(datos({ entidadesActuales: [ent(1, { monto: 9901 }), ent(5, { monto: 99 })] }), HOY).puntaje).toBe(100);
  });
  it("una entidad con el 100 % de la deuda en situación 5 sigue siendo banda D (ORBE TEXTIL)", () => {
    const r = calcularPuntaje(datos({ entidadesActuales: [ent(5, { monto: 10793 })] }), HOY);
    expect(r).toMatchObject({ puntaje: 40, banda: "D", situacionPeor: 5 });
  });
  it("si todas las deudas son 0 no divide ni ignora la situación mala", () => {
    expect(calcularPuntaje(datos({ entidadesActuales: [ent(4, { monto: 0 })] }), HOY).situacionPeor).toBe(4);
  });
  it("−20 si el BCRA informa proceso judicial o situación jurídica (TFM FRATELLI)", () => {
    const r = calcularPuntaje(datos({ entidadesActuales: [ent(1, { entidad: "BANCO CIUDAD", juridico: true })] }), HOY);
    expect(r.puntaje).toBe(80);
    expect(r.ajustes[0]).toEqual({ motivo: "Proceso judicial o situación jurídica informada por el BCRA (BANCO CIUDAD)", puntos: -20 });
  });
  it("normalizar lee situacionJuridica y procesoJud de las entidades", () => {
    const deudas = { results: { periodos: [{ periodo: "202609", entidades: [
      { entidad: "A", situacion: 1, monto: 1, situacionJuridica: true },
      { entidad: "B", situacion: 1, monto: 1, procesoJud: true },
      { entidad: "C", situacion: 1, monto: 1 },
    ] }] } };
    const d = normalizar("30703088534", deudas, { results: { periodos: [] } }, null, "bcra-live", "2026-11-03T12:00:00.000Z");
    expect(d.entidadesActuales.map((e) => e.juridico)).toEqual([true, true, false]);
  });
  it("normalizar no depende del orden de los períodos de /Deudas", () => {
    const deudas = { results: { periodos: [
      { periodo: "202608", entidades: [{ entidad: "VIEJA", situacion: 5, monto: 1 }] },
      { periodo: "202609", entidades: [{ entidad: "NUEVA", situacion: 1, monto: 1 }] },
    ] } };
    const d = normalizar("30703088534", deudas, { results: { periodos: [] } }, null, "bcra-live", "2026-11-03T12:00:00.000Z");
    expect(d.entidadesActuales.map((e) => e.entidad)).toEqual(["NUEVA"]);
  });
  it("deuda creciente: compara contra el mes de hace 6 meses aunque falten períodos en la serie", () => {
    // Faltan 202607 y 202606 (sin deuda ese mes): la posición 6 sería 202602, pero hace 6 meses es 202603.
    const faltantes = [
      { periodo: "202609", total: 120 }, { periodo: "202608", total: 0 }, { periodo: "202605", total: 0 },
      { periodo: "202604", total: 0 }, { periodo: "202603", total: 100 }, { periodo: "202602", total: 500 }, { periodo: "202601", total: 500 },
    ];
    expect(calcularPuntaje(datos({ deudaPorPeriodo: faltantes }), HOY).deudaCreciente).toBe(true);
  });
  it("deuda creciente: si hace 6 meses no había deuda no compara (DON OCTAVIO, 0 → 33)", () => {
    expect(calcularPuntaje(datos({ deudaPorPeriodo: serie(33, 0, 0, 0, 0, 0, 0) }), HOY).deudaCreciente).toBe(false);
  });
  it("cheque rechazado con fecha de pago de la multa pero sin fecha de pago sigue contando como impago (campos del BCRA)", () => {
    const rech = { results: { causales: [{ causal: "SIN FONDOS SUFICIENTES", entidades: [{ detalle: [{ fechaRechazo: "2026-05-10", fechaPago: null, fechaPagoMulta: "2026-05-20" }] }] }] } };
    const d = normalizar("30703088534", { results: {} }, { results: { periodos: [] } }, rech, "bcra-live", "2026-11-03T12:00:00.000Z");
    expect(calcularPuntaje(d, HOY).chequesRechazadosImpagos).toBe(1);
  });
  it("ARCOR: defectos formales sin pagar de 2022 no penalizan y se informan con 0 puntos", () => {
    const r = calcularPuntaje(datos({ rechazados: [{ fechaRechazo: "2022-04-04", causal: "DEFECTOS FORMALES", impago: true }] }), HOY);
    expect(r.puntaje).toBe(100);
    expect(r.ajustes).toHaveLength(1);
    expect(r.ajustes[0].puntos).toBe(0);
  });
});

describe("validación del CUIT", () => {
  it("acepta CUITs reales y rechaza dígito verificador, largo y letras inválidos", () => {
    for (const c of ["30546689979", "30502793175", "30500010084", "30703088534", "30111111118"]) expect(cuitValido(c)).toBe(true);
    for (const c of ["30546689978", "123", "abcdefghijk", "3054668997900", "00000000000", ""]) expect(cuitValido(c)).toBe(false);
  });
  it("un CUIT mal escrito falla antes de llamar al BCRA y no cae a la copia ni a '502'", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    await expect(consultarBcra("30546689978", { fetchFn: f })).rejects.toBeInstanceOf(CuitInvalidoError);
    await expect(consultarBcra("30546689978", { fetchFn: f })).rejects.toBeInstanceOf(CuitSinDatosError);
    await expect(consultarBcra("30546689978", { fetchFn: f })).rejects.toThrow(/no es válido/);
    expect(f).not.toHaveBeenCalled();
  });
  it("scoreLibrador limpia guiones y espacios antes de validar", async () => {
    const f = vi.fn(async () => { throw new TypeError("sin red"); });
    vi.stubGlobal("fetch", f);
    try {
      const r = await scoreLibrador("30-70308853-4", { modo: "auto" });
      expect(r.cuit).toBe("30703088534");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("bordes de cotizar", () => {
  const input: InputCotizacion = { cuit: "30703088534", nominal: "10000000", vencimiento: "2027-01-02", pyme: "0x0000000000000000000000000000000000000001" };
  const scoringA = calcularPuntaje(datos(), HOY);
  const f = (cambios: Partial<InputCotizacion>, ahora: Date = HOY) => cotizar({ ...input, ...cambios }, scoringA, CONFIG_FONDO, ahora, "sal-de-prueba");

  it("una fecha de vencimiento inexistente o mal escrita falla con un mensaje claro, sin corregirla en silencio", () => {
    for (const v of ["basura", "2027-1-2", "2027-02-30", "2027-13-01", "2027-00-10", ""]) expect(() => f({ vencimiento: v })).toThrow(/Fecha de vencimiento inválida/);
  });
  it("acepta una fecha con hora pegada (se usa solo el día) y el 29 de febrero de un año bisiesto", () => {
    expect(f({ vencimiento: "2027-01-02T00:00:00Z" }).dias).toBe(60);
    expect(f({ vencimiento: "2028-02-29" }, new Date("2028-01-01T15:00:00Z")).dias).toBe(59);
    expect(() => f({ vencimiento: "2027-02-29" })).toThrow(/inválida/); // 2027 no es bisiesto
  });
  it("«hoy» es la fecha de Buenos Aires: a las 22:00 del 3/11 (01:00Z del 4/11) un cheque del 4/11 tiene 1 día", () => {
    expect(f({ vencimiento: "2026-11-04" }, new Date("2026-11-04T01:00:00Z")).dias).toBe(1);
  });
  it("monto con coma, negativo o texto falla como monto inválido", () => {
    for (const n of ["5000000,50", "-5000000", "abc"]) expect(() => f({ nominal: n })).toThrow(/Monto inválido/);
  });
  it("el precio de compra más el descuento siempre suman exactamente el nominal", () => {
    for (const nominal of ["1000000", "1234567.89", "9999999.99", "50000000"]) {
      const c = f({ nominal });
      expect(aCentavos(c.precioCompra) + aCentavos(c.descuento)).toBe(aCentavos(nominal));
    }
  });
});

describe("exclusión por cheques rechazados impagos (BCRA, de cualquier antigüedad)", () => {
  const input: InputCotizacion = { cuit: "30-70308853-4", nominal: "10000000", vencimiento: "2027-01-02", pyme: "0x0000000000000000000000000000000000000001" };
  const salt = "sal-de-prueba";
  const cot = (rechazados: DatosBcra["rechazados"], extra: Partial<DatosBcra> = {}, inp: InputCotizacion = input) =>
    cotizar(inp, calcularPuntaje(datos({ rechazados, ...extra }), HOY), CONFIG_FONDO, HOY, salt);

  it("sin antecedentes: aprobada, como siempre", () => {
    expect(antecedentesCheques(datos()).estado).toBe("limpio");
    expect(cot([]).aprobada).toBe(true);
  });
  it("impago confirmado reciente: rechazada y el motivo lo dice", () => {
    const c = cot([{ fechaRechazo: "2026-09-10", causal: "SIN FONDOS", impago: true }]);
    expect(c.aprobada).toBe(false);
    expect(c.tasaTnaBps).toBe(0);
    expect(c.motivoRechazo).toBe("El librador tiene 1 cheque rechazado sin pagar informado por el BCRA (el último el 10/9/2026, causal sin fondos): el fondo no compra cheques de libradores con impagos.");
    expect(c.explicacion).toContain(c.motivoRechazo!);
    expect(c.explicacion).not.toMatch(/rinde/i);
  });
  it("impago viejo (más de 12 meses): también se rechaza aunque el puntaje sea 100", () => {
    const s = calcularPuntaje(datos({ rechazados: [{ fechaRechazo: "2023-03-05", causal: "SIN FONDOS", impago: true }] }), HOY);
    expect(s.puntaje).toBe(100);
    expect(s.chequesRechazadosImpagos).toBe(0);
    const c = cotizar(input, s, CONFIG_FONDO, HOY, salt);
    expect(c.aprobada).toBe(false);
    expect(c.motivoRechazo).toMatch(/sin pagar.*5\/3\/2023/);
  });
  it("varios impagos: plural y el último por fecha", () => {
    const c = cot([
      { fechaRechazo: "2022-01-10", causal: "SIN FONDOS", impago: true },
      { fechaRechazo: "2024-07-01", causal: "CUENTA CERRADA", impago: true },
    ]);
    expect(c.motivoRechazo).toContain("2 cheques rechazados sin pagar informados");
    expect(c.motivoRechazo).toContain("el último el 1/7/2024, causal cuenta cerrada");
  });
  it("solo regularizados (con fecha de pago): se aprueba", () => {
    const r = [{ fechaRechazo: "2026-05-10", causal: "SIN FONDOS", impago: false }];
    expect(antecedentesCheques(datos({ rechazados: r }))).toMatchObject({ estado: "limpio", regularizados: 1, impagosConfirmados: 0 });
    expect(cot(r).aprobada).toBe(true);
  });
  it("solo defectos formales: se aprueba", () => {
    const r = [{ fechaRechazo: "2025-02-13", causal: "DEFECTOS FORMALES", impago: true }];
    expect(antecedentesCheques(datos({ rechazados: r }))).toMatchObject({ estado: "limpio", administrativos: 1 });
    expect(cot(r).aprobada).toBe(true);
  });
  it("Telecom (copia guardada, un rechazo por defectos formales): sigue aprobada", async () => {
    const d = await consultarBcra("30639453738", { modo: "cache" });
    expect(antecedentesCheques(d)).toMatchObject({ estado: "limpio", administrativos: 1, impagosConfirmados: 0 });
    const c = cotizar({ ...input, cuit: "30639453738" }, calcularPuntaje(d, HOY), CONFIG_FONDO, HOY, salt);
    expect(c.aprobada).toBe(true);
  });
  it("en revisión: se rechaza por datos insuficientes", () => {
    const c = cot([{ fechaRechazo: "2026-08-01", causal: "SIN FONDOS", impago: true, enRevision: true }]);
    expect(c.aprobada).toBe(false);
    expect(c.motivoRechazo).toMatch(/en revisión.*sin esa verificación no se aprueba/);
    expect(c.motivoRechazo).not.toMatch(/sin pagar informado/);
  });
  it("un impago confirmado pesa más que uno en revisión", () => {
    const c = cot([
      { fechaRechazo: "2026-08-01", causal: "SIN FONDOS", impago: true, enRevision: true },
      { fechaRechazo: "2021-08-01", causal: "SIN FONDOS", impago: true },
    ]);
    expect(c.motivoRechazo).toContain("1 cheque rechazado sin pagar informado");
  });
  it("cheques rechazados no disponibles: se rechaza por no poder verificar", () => {
    const c = cot([], { rechazadosVerificados: false });
    expect(c.aprobada).toBe(false);
    expect(c.motivoRechazo).toBe("No pudimos verificar en el BCRA los antecedentes de cheques rechazados del librador: no se aprueba sin esa verificación.");
  });
  it("precedencia: impago + plazo inválido + puntaje bajo, el motivo es el del impago", () => {
    const r = [{ fechaRechazo: "2020-01-10", causal: "SIN FONDOS", impago: true }];
    const vencido = cot(r, {}, { ...input, vencimiento: "2026-10-01" });
    expect(vencido.motivoRechazo).toContain("sin pagar");
    const largo = cot(r, { entidadesActuales: [ent(5)] }, { ...input, vencimiento: "2030-01-01" });
    expect(largo.motivoRechazo).toContain("sin pagar");
  });
  it("la exclusión se dice una vez en la explicación", () => {
    const c = cot([{ fechaRechazo: "2020-01-10", causal: "SIN FONDOS", impago: true }]);
    expect(c.explicacion.split("sin pagar informado").length - 1).toBe(1);
  });

  describe("consulta al BCRA", () => {
    const ok = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: 200 });
    const deudas = { results: { identificacion: 1, denominacion: "EMPRESA", periodos: [{ periodo: "202609", entidades: [{ entidad: "B", situacion: 1, monto: 5, refinanciaciones: false }] }] } };
    const historicas = { results: { periodos: [{ periodo: "202609", entidades: [{ monto: 5 }] }] } };
    const rechazadosOk = { results: { causales: [{ causal: "SIN FONDOS", entidades: [{ entidad: 1, detalle: [{ fechaRechazo: "2026-01-02", fechaPago: null, enRevision: false }] }] }] } };
    const enrutar = (rech: Response | (() => never)) =>
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("ChequesRechazados")) return typeof rech === "function" ? rech() : rech;
        return ok(u.includes("Historicas") ? historicas : deudas);
      }) as unknown as typeof fetch;

    it.each([429, 500])("ChequesRechazados responde %i y no hay copia: datos marcados sin verificar, y la cotización se rechaza", async (status) => {
      const d = await consultarBcra("30111111118", { fetchFn: enrutar(new Response("{}", { status })), ahora: HOY });
      expect(d.fuente).toBe("bcra-live");
      expect(d.rechazadosVerificados).toBe(false);
      expect(antecedentesCheques(d).estado).toBe("no_verificado");
      expect(cotizar(input, calcularPuntaje(d, HOY), CONFIG_FONDO, HOY, salt).aprobada).toBe(false);
    });
    it("modo live: también vuelve marcado sin verificar (no usa copia)", async () => {
      const d = await consultarBcra("30703088534", { modo: "live", fetchFn: enrutar(new Response("{}", { status: 429 })), ahora: HOY });
      expect(d.fuente).toBe("bcra-live");
      expect(d.rechazadosVerificados).toBe(false);
    });
    it("falla de red solo en ChequesRechazados: sin verificar (no se pierde toda la consulta)", async () => {
      const d = await consultarBcra("30111111118", { fetchFn: enrutar(() => { throw new TypeError("sin red"); }), ahora: HOY });
      expect(d.rechazadosVerificados).toBe(false);
    });
    it("modo auto con copia: usa la copia cuando falla ChequesRechazados", async () => {
      const d = await consultarBcra("30703088534", { fetchFn: enrutar(new Response("{}", { status: 500 })), ahora: HOY });
      expect(d.fuente).toBe("bcra-cache");
      expect(d.rechazadosVerificados).toBeUndefined();
    });
    it("404 en vivo = verificado, sin rechazos; 200 se clasifica", async () => {
      const limpio = await consultarBcra("30111111118", { fetchFn: enrutar(new Response("{}", { status: 404 })), ahora: HOY });
      expect(antecedentesCheques(limpio).estado).toBe("limpio");
      const impago = await consultarBcra("30111111118", { fetchFn: enrutar(ok(rechazadosOk)), ahora: HOY });
      expect(antecedentesCheques(impago)).toMatchObject({ estado: "impago", impagosConfirmados: 1 });
    });
  });
});

describe("tasa por puntaje (TAMAR + 1,2 pp por punto que falta, piso 30 %, tope 60 %) y puntaje mínimo 70", () => {
  const input: InputCotizacion = { cuit: "30-70308853-4", nominal: "10000000", vencimiento: "2027-01-02", pyme: "0x0000000000000000000000000000000000000001" };
  const salt = "sal-de-prueba";
  const base = calcularPuntaje(datos(), HOY);
  const conPuntaje = (puntaje: number) => cotizar(input, { ...base, puntaje, banda: bandaDe(puntaje) }, CONFIG_FONDO, HOY, salt);

  it("las constantes son las decididas el 7-11-2026", () => {
    expect([SPREAD_POR_PUNTO_BPS, TASA_MIN_BPS, TASA_MAX_BPS, PUNTAJE_MINIMO]).toEqual([120, 3000, 6000, 70]);
  });
  it.each([
    [100, 3000, "piso"], // 2406 → piso
    [95, 3006, null], // 2406 + 600: justo sobre el piso
    [94, 3126, null],
    [90, 3606, null],
    [85, 4206, null],
    [80, 4806, null],
    [75, 5406, null],
    [71, 5886, null],
    [70, 6000, "tope"], // 2406 + 3600 = 6006 → tope
  ])("puntaje %i → %i bps (%s)", (puntaje, bps, limite) => {
    const t = tasaPorPuntaje(puntaje, 2406);
    expect(t.tasaBps).toBe(bps);
    expect(t.aplicado).toBe(limite);
    const c = conPuntaje(puntaje);
    expect(c.aprobada).toBe(true);
    expect(c.tasaTnaBps).toBe(bps);
  });
  it("la tasa nunca baja del piso ni pasa el tope, y es monótona", () => {
    let anterior = 0;
    for (let p = 100; p >= 0; p--) {
      const t = tasaPorPuntaje(p, 2406).tasaBps;
      expect(t).toBeGreaterThanOrEqual(TASA_MIN_BPS);
      expect(t).toBeLessThanOrEqual(TASA_MAX_BPS);
      expect(t).toBeGreaterThanOrEqual(anterior);
      anterior = t;
    }
  });
  it("la explicación dice TAMAR, el spread por puntaje y el piso / tope cuando se aplican", () => {
    expect(conPuntaje(90).explicacion).toMatch(/TAMAR 24,06 %\) más un spread de 12 pp por el puntaje.*: 36,06 % anual/);
    expect(conPuntaje(90).explicacion).not.toMatch(/piso|tope/);
    expect(conPuntaje(100).explicacion).toMatch(/llevada al piso de 30 %/);
    expect(conPuntaje(70).explicacion).toMatch(/spread de 36 pp.*llevada al tope de 60 %/);
    for (const p of [100, 90, 70]) expect(conPuntaje(p).explicacion).not.toMatch(/rinde|rendimiento garantizado/i);
  });
  it("puntaje 70 se aprueba y 69 se rechaza con el motivo del mínimo (banda C)", () => {
    expect(conPuntaje(70).aprobada).toBe(true);
    const r = conPuntaje(69);
    expect(r.aprobada).toBe(false);
    expect(r.tasaTnaBps).toBe(0);
    expect(r.precioCompra).toBe("0");
    expect(r.motivoRechazo).toBe("El puntaje del librador (69/100) es menor al mínimo del fondo (70): no compramos sus cheques.");
    expect(conPuntaje(54).aprobada).toBe(false); // banda D
    expect(conPuntaje(0).aprobada).toBe(false);
  });
  it("el spread por banda de ConfigFondo ya no cambia la tasa", () => {
    const cfg: ConfigFondo = { ...CONFIG_FONDO, spreadPorBandaBps: { A: 9999, B: 9999, C: 1, D: 1 } };
    expect(cotizar(input, { ...base, puntaje: 90, banda: "A" }, cfg, HOY, salt).tasaTnaBps).toBe(3606);
  });
});
