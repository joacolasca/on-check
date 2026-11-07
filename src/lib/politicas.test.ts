// Las políticas que muestra la UI tienen que coincidir con lo que hace el código (puntaje, cotizar, garantías, contrato).
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import type { InputCotizacion } from "@/shared/types";
import { PoliticasFondo } from "@/components/PoliticasFondo";
import { POLITICA_POR_DEFECTO } from "./chain/politica";
import { POLITICA_FONDO } from "./agent/politica";
import { NOMBRE_GARANTIA } from "./cotizacion";
import { formatBps } from "./format";
import { analizarGarantiaBase, PERFILES } from "./garantias";
import {
  SECCIONES,
  bandas,
  comoFunciona,
  cuotaparte,
  ejemplosTasa,
  factoresScoring,
  formulaCobertura,
  formulaTasa,
  garantiasEfectos,
  garantiasExplicacion,
  garantiasPorTipo,
  notaModeloPuntaje,
  objetivo,
  reglasObligatorias,
  seleccion,
  totalDeduccionesMaximas,
} from "./politicas";
import type { DatosBcra, EntidadDeuda } from "./scoring/bcra-tipos";
import { CONFIG_FONDO, PUNTAJE_MINIMO, SPREAD_POR_PUNTO_BPS, TASA_MAX_BPS, TASA_MIN_BPS } from "./scoring/config";
import { cotizar } from "./scoring/cotizar";
import { bandaDe, calcularPuntaje } from "./scoring/puntaje";

const HOY = new Date("2026-11-03T15:00:00Z");
const ent = (situacion: number, extra: Partial<EntidadDeuda> = {}): EntidadDeuda => ({ entidad: "BANCO X", situacion, monto: 100, refinanciaciones: false, ...extra });
const datos = (cambios: Partial<DatosBcra> = {}): DatosBcra => ({
  cuit: "30703088534", denominacion: "EMPRESA S.A.", entidadesActuales: [ent(1)], deudaPorPeriodo: [], rechazados: [],
  fuente: "bcra-cache", consultadoEn: "2026-11-03T12:00:00.000Z", ...cambios,
});
const serie = (...totales: number[]) => totales.map((total, i) => ({ periodo: String(202609 - i), total }));
const factor = (id: string) => {
  const f = factoresScoring.find((x) => x.id === id);
  if (!f) throw new Error(`falta el factor ${id}`);
  return f;
};
const regla = (id: string) => {
  const r = reglasObligatorias.find((x) => x.id === id);
  if (!r) throw new Error(`falta la regla ${id}`);
  return r;
};
const puntosRestados = (d: DatosBcra) => 100 - calcularPuntaje(d, HOY).puntaje;
const input: InputCotizacion = { cuit: "30-70308853-4", nominal: "10000000", vencimiento: "2027-01-02", pyme: "0x0000000000000000000000000000000000000001" };
const SAL = "sal-de-prueba";
const contrato = readFileSync(new URL("../../contracts/src/ChequeFund.sol", import.meta.url), "utf8");
const constanteDelContrato = (nombre: string): number => {
  const m = contrato.match(new RegExp(`${nombre}\\s*=\\s*(\\d+)`));
  if (!m) throw new Error(`no encuentro ${nombre} en ChequeFund.sol`);
  return Number(m[1]);
};

describe("factores del puntaje: lo documentado es lo que resta el código", () => {
  it("situación BCRA: resta lo documentado por nivel y el máximo documentado (situación 6)", () => {
    expect(puntosRestados(datos({ entidadesActuales: [ent(2)] }))).toBe(15);
    expect(puntosRestados(datos({ entidadesActuales: [ent(6)] }))).toBe(factor("situacion-bcra").pesoMax);
  });
  it("jurídico, rechazados impagos (12 meses), refinanciaciones y deuda creciente", () => {
    expect(puntosRestados(datos({ entidadesActuales: [ent(1, { juridico: true })] }))).toBe(factor("juridico").pesoMax);
    expect(puntosRestados(datos({ rechazados: [{ fechaRechazo: "2026-05-10", causal: "SIN FONDOS", impago: true }] }))).toBe(factor("rechazados").pesoMax);
    expect(puntosRestados(datos({ entidadesActuales: [ent(1, { refinanciaciones: true })] }))).toBe(factor("refinanciaciones").pesoMax);
    expect(puntosRestados(datos({ deudaPorPeriodo: serie(120, 0, 0, 0, 0, 0, 100) }))).toBe(factor("deuda-creciente").pesoMax);
  });
  it("el texto de cada factor nombra su cifra", () => {
    expect(factor("situacion-bcra").comoSeMide).toContain("15 puntos por cada nivel");
    expect(factor("rechazados").comoSeMide).toContain("12 meses");
    expect(factor("deuda-creciente").comoSeMide).toContain("10 %");
    expect(factor("deuda-creciente").comoSeMide).toContain("6 meses");
  });
  it("la suma de máximos es la de los factores y el puntaje no baja de 0", () => {
    expect(totalDeduccionesMaximas).toBe(factoresScoring.reduce((s, f) => s + f.pesoMax, 0));
    const todo = datos({ entidadesActuales: [ent(6, { juridico: true, refinanciaciones: true })], rechazados: [{ fechaRechazo: "2026-05-10", causal: "SIN FONDOS", impago: true }], deudaPorPeriodo: serie(120, 0, 0, 0, 0, 0, 100) });
    expect(calcularPuntaje(todo, HOY).puntaje).toBe(0);
    expect(notaModeloPuntaje).toMatch(/recorta entre 0 y 100/);
  });
  it("no hay un factor de garantías ni de monto o plazo en el puntaje", () => {
    expect(factoresScoring.map((f) => f.id)).not.toContain("garantias");
    const base = calcularPuntaje(datos(), HOY);
    const pagare = cotizar({ ...input, nominal: "50000000", vencimiento: "2027-02-01" }, base, CONFIG_FONDO, HOY, SAL);
    expect(pagare.scoring.puntaje).toBe(base.puntaje);
  });
});

describe("bandas, puntaje mínimo y tasa: lo documentado es lo que calcula cotizar", () => {
  it("los bordes de las bandas salen de bandaDe", () => {
    expect(bandas.map((b) => [b.banda, b.desde])).toEqual([["A", 85], ["B", 70], ["C", 55], ["D", 0]]);
    for (const b of bandas) {
      expect(bandaDe(b.desde)).toBe(b.banda);
      if (b.desde > 0) expect(bandaDe(b.desde - 1)).not.toBe(b.banda);
      expect(b.secompra).toBe(b.desde >= PUNTAJE_MINIMO);
    }
  });
  it("puntaje mínimo 70 en la regla y en cotizar (69 rechaza, 70 aprueba)", () => {
    expect(PUNTAJE_MINIMO).toBe(70);
    expect(regla("puntaje-minimo").titulo).toContain("70");
    const base = calcularPuntaje(datos(), HOY);
    expect(cotizar(input, { ...base, puntaje: 69, banda: bandaDe(69) }, CONFIG_FONDO, HOY, SAL).aprobada).toBe(false);
    expect(cotizar(input, { ...base, puntaje: 70, banda: bandaDe(70) }, CONFIG_FONDO, HOY, SAL).aprobada).toBe(true);
  });
  it("la tabla de tasas coincide con cotizar() para cada puntaje", () => {
    expect(ejemplosTasa.map((e) => e.puntaje)).toEqual([100, 95, 90, 85, 80, 75, 70, 69]);
    const base = calcularPuntaje(datos(), HOY);
    for (const e of ejemplosTasa) {
      const c = cotizar(input, { ...base, puntaje: e.puntaje, banda: bandaDe(e.puntaje) }, CONFIG_FONDO, HOY, SAL);
      expect(e.banda).toBe(bandaDe(e.puntaje));
      if (e.puntaje < PUNTAJE_MINIMO) {
        expect(e.tasaTnaBps).toBeNull();
        expect(c.aprobada).toBe(false);
      } else {
        expect(e.tasaTnaBps).toBe(c.tasaTnaBps);
      }
    }
    expect(ejemplosTasa.find((e) => e.puntaje === 100)).toMatchObject({ tasaTnaBps: TASA_MIN_BPS, aplicado: "piso" });
    expect(ejemplosTasa.find((e) => e.puntaje === 70)).toMatchObject({ tasaTnaBps: TASA_MAX_BPS, aplicado: "tope" });
  });
  it("la fórmula nombra TAMAR, spread por punto, piso y tope reales", () => {
    expect(SPREAD_POR_PUNTO_BPS).toBe(120);
    expect(formulaTasa).toContain(`TAMAR (${formatBps(CONFIG_FONDO.tamarTnaBps)})`);
    expect(formulaTasa).toContain("1,2 puntos porcentuales");
    expect(formulaTasa).toContain(`piso de ${formatBps(TASA_MIN_BPS)}`);
    expect(formulaTasa).toContain(`tope de ${formatBps(TASA_MAX_BPS)}`);
  });
});

describe("reglas obligatorias", () => {
  it("la exclusión por impagos: un impago viejo rechaza aunque el puntaje sea 100; regularizados y formales no", () => {
    const viejo = calcularPuntaje(datos({ rechazados: [{ fechaRechazo: "2021-03-05", causal: "SIN FONDOS", impago: true }] }), HOY);
    expect(viejo.puntaje).toBe(100);
    expect(cotizar(input, viejo, CONFIG_FONDO, HOY, SAL).aprobada).toBe(false);
    expect(regla("impagos-confirmados").descripcion).toMatch(/cualquier antigüedad/);
    const ok = calcularPuntaje(datos({ rechazados: [{ fechaRechazo: "2021-03-05", causal: "SIN FONDOS", impago: false }, { fechaRechazo: "2021-03-05", causal: "DEFECTOS FORMALES", impago: true }] }), HOY);
    expect(cotizar(input, ok, CONFIG_FONDO, HOY, SAL).aprobada).toBe(true);
  });
  it("datos no verificables: se rechaza", () => {
    const s = calcularPuntaje(datos({ rechazadosVerificados: false }), HOY);
    expect(cotizar(input, s, CONFIG_FONDO, HOY, SAL).aprobada).toBe(false);
    expect(regla("datos-no-verificables").descripcion).toMatch(/no se aprueba/);
  });
  it("plazo y monto salen de CONFIG_FONDO y cotizar los hace cumplir", () => {
    expect(regla("plazo").titulo).toContain(String(CONFIG_FONDO.plazoMaxDias));
    expect(regla("monto").titulo).toMatch(/1\.000\.000.*50\.000\.000/);
    const s = calcularPuntaje(datos(), HOY);
    expect(cotizar({ ...input, vencimiento: "2027-02-02" }, s, CONFIG_FONDO, HOY, SAL).aprobada).toBe(false); // 91 días
    expect(cotizar({ ...input, nominal: "999999" }, s, CONFIG_FONDO, HOY, SAL).aprobada).toBe(false);
    expect(cotizar({ ...input, nominal: "50000001" }, s, CONFIG_FONDO, HOY, SAL).aprobada).toBe(false);
  });
  it("10 % emisor, 25 % industria y 15 % liquidez: igual a la política y a los valores por defecto del contrato", () => {
    expect(POLITICA_POR_DEFECTO).toMatchObject({ maxEmisorBps: 1000, maxIndustriaBps: 2500, liquidezMinBps: 1500 });
    expect(POLITICA_FONDO).toEqual(POLITICA_POR_DEFECTO);
    expect(constanteDelContrato("maxConcentracionBps")).toBe(POLITICA_POR_DEFECTO.maxEmisorBps);
    expect(constanteDelContrato("maxIndustriaBps")).toBe(POLITICA_POR_DEFECTO.maxIndustriaBps);
    expect(constanteDelContrato("liquidezMinBps")).toBe(POLITICA_POR_DEFECTO.liquidezMinBps);
    expect(constanteDelContrato("comisionAnualBps")).toBe(POLITICA_POR_DEFECTO.comisionAnualBps);
    expect(regla("emisor").titulo).toContain("10 %");
    expect(regla("industria").titulo).toContain("25 %");
    expect(regla("liquidez").titulo).toContain("15 %");
    expect(regla("kyc").aplica).toBe("Contrato");
  });
  it("cada regla dice quién la hace cumplir", () => {
    for (const r of reglasObligatorias) expect(["Sistema", "Contrato", "Sistema y contrato"]).toContain(r.aplica);
    expect(reglasObligatorias.map((r) => r.id)).toEqual(expect.arrayContaining(["puntaje-minimo", "impagos-confirmados", "datos-no-verificables", "plazo", "monto", "emisor", "industria", "liquidez", "kyc"]));
  });
});

describe("garantías: lo documentado es lo que hace el código", () => {
  it("los descuentos de la pantalla son los de PERFILES, para todos los tipos", () => {
    expect(garantiasPorTipo).toHaveLength(Object.keys(PERFILES).length);
    for (const g of garantiasPorTipo) {
      expect(g.haircutBps).toBe(PERFILES[g.tipo as keyof typeof PERFILES].haircutBps);
      expect(g.liquidez).toBe(PERFILES[g.tipo as keyof typeof PERFILES].liquidez);
      expect(g.nombre).toBe(NOMBRE_GARANTIA[g.tipo]);
    }
  });
  it("la cobertura es valor × (1 − descuento) ÷ nominal", () => {
    expect(formulaCobertura).toMatch(/valor declarado × \(1 − descuento del tipo\) ÷ valor nominal/);
    const a = analizarGarantiaBase({ tipo: "energia", descripcion: "Turbina", valorDeclarado: "16000000" }, "8000000");
    expect(a.haircutBps).toBe(PERFILES.energia.haircutBps);
    expect(a.coberturaBps).toBe(Math.round((16_000_000 * (10_000 - PERFILES.energia.haircutBps)) / 8_000_000));
    expect(a.documentosPendientes.length).toBeGreaterThan(0);
  });
  it("la garantía NO cambia puntaje, tasa, precio ni aprobación", () => {
    const s = calcularPuntaje(datos(), HOY);
    const sin = cotizar(input, s, CONFIG_FONDO, HOY, SAL);
    const garantia = analizarGarantiaBase({ tipo: "terreno", descripcion: "Terreno", valorDeclarado: "100" }, input.nominal);
    const con = cotizar(input, s, CONFIG_FONDO, HOY, SAL, { garantia });
    expect({ t: con.tasaTnaBps, p: con.precioCompra, a: con.aprobada, pu: con.scoring.puntaje }).toEqual({ t: sin.tasaTnaBps, p: sin.precioCompra, a: sin.aprobada, pu: sin.scoring.puntaje });
    expect(garantiasEfectos.filter((e) => !e.cambia).map((e) => e.texto).join(" ")).toMatch(/puntaje, la tasa ni el precio/);
  });
  it("el texto aclara que es un análisis y que la prenda es posterior", () => {
    expect(garantiasExplicacion.join(" ")).toMatch(/paso posterior/);
    expect(garantiasExplicacion.join(" ")).toMatch(/no se verifica/);
  });
});

describe("objetivo, comisión y cuotaparte", () => {
  it("objetivo y comisión salen de la política", () => {
    expect(objetivo.tnaBps).toBe(POLITICA_POR_DEFECTO.objetivoTnaBps);
    expect(objetivo.texto).toContain(formatBps(POLITICA_POR_DEFECTO.objetivoTnaBps));
    expect(cuotaparte.find((c) => c.titulo === "Comisión")?.texto).toContain(formatBps(POLITICA_POR_DEFECTO.comisionAnualBps));
    expect(comoFunciona.join(" ")).toContain(formatBps(POLITICA_POR_DEFECTO.comisionAnualBps));
  });
  it("el objetivo de 40 % es neto de la comisión: bruto = objetivo + comisión (43 %)", () => {
    expect(objetivo.brutoBps).toBe(POLITICA_POR_DEFECTO.objetivoTnaBps + POLITICA_POR_DEFECTO.comisionAnualBps);
    expect(objetivo.brutoBps).toBe(4300);
    expect(objetivo.texto).toMatch(/neto/);
    expect(objetivo.texto).toContain(formatBps(objetivo.brutoBps));
  });
  it("el objetivo se presenta como no garantizado", () => {
    expect(objetivo.aviso).toMatch(/no está garantizado/);
    expect(objetivo.aviso).toMatch(/puede no cumplirse/);
  });
  it("suscripción mínima y rescate salen de la política y del contrato", () => {
    const t = cuotaparte.find((c) => c.titulo === "Suscripción y rescate")?.texto ?? "";
    expect(t).toContain(`${POLITICA_POR_DEFECTO.rescateHorasHabiles} horas hábiles`);
    expect(t).toContain(`${POLITICA_POR_DEFECTO.rescateCorteHora} hs`);
    expect(t).toMatch(/1\.000 cuotapartes/);
    expect(contrato).toMatch(/MIN_CUOTAPARTES = 1000e18/);
    expect(contrato).toMatch(/PRECIO_INICIAL = 1000/);
  });
  it("la cuotaparte describe pago, rebote y comisión como el contrato", () => {
    const todo = cuotaparte.map((c) => `${c.titulo} ${c.texto}`).join(" ");
    expect(todo).toMatch(/se paga/);
    expect(todo).toMatch(/rebota/);
    expect(contrato).toMatch(/function marcarRechazado/);
    expect(contrato).toMatch(/emiten.*cuotapartes al receptor|_mint\(feeReceptor/s);
  });
});

describe("textos de la pantalla", () => {
  const html = renderToStaticMarkup(createElement(PoliticasFondo));
  const textos = [
    html,
    ...comoFunciona, ...seleccion, notaModeloPuntaje, formulaTasa, objetivo.texto, objetivo.aviso, objetivo.comision,
    ...garantiasExplicacion, ...garantiasEfectos.map((e) => e.texto),
    ...reglasObligatorias.map((r) => `${r.titulo} ${r.descripcion}`), ...factoresScoring.map((f) => `${f.factor} ${f.comoSeMide}`),
    ...cuotaparte.map((c) => `${c.titulo} ${c.texto}`),
  ].join("\n");

  it("nunca dice 'rinde', 'rendimiento garantizado' ni la sigla de la tecnología", () => {
    expect(textos).not.toMatch(/rinde|rendimiento garantizado/i);
    expect(textos).not.toMatch(/\b(?:IA|AI)\b/);
  });
  it("no muestra rutas de archivos del repo", () => {
    expect(textos).not.toMatch(/src\/lib|contracts\/src|\.sol|\.ts\b/);
  });
  it("renderiza todas las secciones con sus anclas y el aviso de objetivo", () => {
    for (const s of SECCIONES) expect(html).toContain(`id="${s.id}"`);
    expect(html).toContain("no está garantizado");
    expect(html).toContain("Rechazado");
  });
});
