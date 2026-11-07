// Mandato: validación, las 11 reglas (cada una cumple / no cumple, y el orden), estado firmado, informe, bandeja y replanificación.
import cuitsDemo from "@fixtures/cheques-demo.json";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analizarGarantiaBase } from "@/lib/garantias";
import type { ActivoBandeja, Banda, CompraMandato, Cotizacion, EstadoMandato, EvaluacionMandato, Mandato, ReboteMandato, ReglaMandato, ResumenFondo } from "@/shared/types";
import { vencimientoEn } from "./activo";
import { leerBandeja, validarBandeja } from "./bandeja";
import { aplicarCompra, aplicarRebote, crearEstadoInicial, firmarEstado, revocarEstado, verificarEstado } from "./estado";
import { armarInforme } from "./informe";
import { evaluarMandato, validarMandato } from "./politica";
import { activosParaReplanificar } from "./rebote";
import { parsearEventoMandato } from "./stream";

const MANDATO: Mandato = { presupuesto: "40000000", bandaMinima: "B", topeEmisorBps: 3500, plazoMaxDias: 90, tipos: ["cheque", "pagare"], coberturaMinBps: 10000, aprobacionSobre: null };
const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const activo = (p: Partial<ActivoBandeja> = {}): ActivoBandeja => ({ id: "x-1", cuit: "30703088534", nombre: "MercadoLibre", tipo: "cheque", nominal: "9000000", dias: 60, ...p });

/** Una cotización mínima: solo los campos que mira el mandato. */
function cot(p: { tipo?: "cheque" | "pagare"; dias?: number; aprobada?: boolean; precio?: string; banda?: Banda; decision?: "aprobar" | "aprobar_con_condiciones" | "rechazar"; cobertura?: number | null; hash?: string; nominal?: string } = {}): Cotizacion {
  const aprobada = p.aprobada ?? true;
  return {
    tipo: p.tipo ?? "cheque",
    dias: p.dias ?? 60,
    aprobada,
    motivoRechazo: aprobada ? null : "El plazo supera el máximo del fondo.",
    precioCompra: aprobada ? (p.precio ?? "8640157.81") : "0",
    libradorHash: p.hash ?? HASH_A,
    id: `0x${"1".repeat(64)}`,
    input: { cuit: "30703088534", nominal: p.nominal ?? "9000000", vencimiento: "2027-01-02", pyme: "0x0000000000000000000000000000000000000001" },
    scoring: { banda: p.banda ?? "A", denominacion: "MERCADOLIBRE S.R.L." },
    decisionPM: { decision: p.decision ?? "aprobar", condiciones: [], resumen: "ok" },
    ...(p.cobertura === null || p.cobertura === undefined ? {} : { garantia: { tipo: "energia", coberturaBps: p.cobertura } }),
  } as unknown as Cotizacion;
}
const estadoBase = (m: Partial<Mandato> = {}): EstadoMandato => crearEstadoInicial({ ...MANDATO, ...m }, new Date("2026-11-07T15:00:00Z"));
const falla = (e: EvaluacionMandato): ReglaMandato[] => e.razones.filter((r) => !r.cumple).map((r) => r.regla);
const compra = (p: Partial<CompraMandato> = {}): CompraMandato => ({ activoId: "a1", nombre: "MercadoLibre", libradorHash: HASH_A, chequeId: `0x${"1".repeat(64)}`, nominal: "9000000", precioCompra: "8640157.81", tx: "0xtx", estado: "Funded", ...p });

describe("validarMandato", () => {
  it("acepta el mandato por defecto y lo normaliza (sin campos de más, tipos sin repetir)", () => {
    const r = validarMandato({ ...MANDATO, tipos: ["cheque", "cheque"], intruso: 1 });
    expect(r).toEqual({ ok: true, mandato: { ...MANDATO, tipos: ["cheque"] } });
  });
  it.each<[string, Record<string, unknown>, RegExp]>([
    ["presupuesto en cero", { presupuesto: "0" }, /presupuesto/],
    ["presupuesto como number", { presupuesto: 40000000 }, /presupuesto/],
    ["presupuesto con muchos decimales", { presupuesto: "1.234" }, /presupuesto/],
    ["presupuesto de más de $ 100.000.000", { presupuesto: "100000000.01" }, /no puede pasar/],
    ["tope por debajo de 100", { topeEmisorBps: 99 }, /tope/],
    ["tope por encima de 10000", { topeEmisorBps: 10001 }, /tope/],
    ["tope fraccionario", { topeEmisorBps: 1500.5 }, /tope/],
    ["plazo en 0", { plazoMaxDias: 0 }, /plazo/],
    ["plazo de 91 días", { plazoMaxDias: 91 }, /plazo/],
    ["tipos vacío", { tipos: [] }, /instrumentos/],
    ["tipo desconocido", { tipos: ["letra"] }, /instrumentos/],
    ["cobertura de 30001", { coberturaMinBps: 30001 }, /cobertura/],
    ["cobertura negativa", { coberturaMinBps: -1 }, /cobertura/],
    ["cobertura sin definir (undefined)", { coberturaMinBps: undefined }, /cobertura/],
    ["banda D", { bandaMinima: "D" }, /banda/],
    ["banda en minúscula", { bandaMinima: "a" }, /banda/],
    ["aprobación en cero", { aprobacionSobre: "0" }, /aprobación/],
    ["aprobación negativa", { aprobacionSobre: "-5" }, /aprobación/],
  ])("rechaza %s", (_nombre, cambio, mensaje) => {
    const r = validarMandato({ ...MANDATO, ...cambio });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toMatch(mensaje);
  });
  it("acepta los bordes: presupuesto máximo, tope 100 y 10000, plazo 1 y 90, cobertura null / 0 / 30000, banda A y C, aprobación positiva", () => {
    for (const cambio of [{ presupuesto: "100000000" }, { topeEmisorBps: 100 }, { topeEmisorBps: 10000 }, { plazoMaxDias: 1 }, { coberturaMinBps: null }, { coberturaMinBps: 0 }, { coberturaMinBps: 30000 }, { bandaMinima: "A" }, { bandaMinima: "C" }, { aprobacionSobre: "5000000" }, { tipos: ["pagare"] }]) {
      expect(validarMandato({ ...MANDATO, ...cambio }).ok, JSON.stringify(cambio)).toBe(true);
    }
  });
  it("rechaza lo que no es un objeto", () => {
    for (const x of [null, undefined, "x", 3, []]) expect(validarMandato(x).ok).toBe(false);
  });
});

describe("evaluarMandato", () => {
  const REGLAS_EN_ORDEN: ReglaMandato[] = ["revocado", "tipo", "plazo", "cotizacion", "banda", "gestor", "cobertura", "emisor_bloqueado", "tope_emisor", "presupuesto", "aprobacion"];

  it("devuelve las 11 razones en el orden de la spec y compra si todas cumplen", () => {
    const e = evaluarMandato(activo(), cot(), estadoBase());
    expect(e.razones.map((r) => r.regla)).toEqual(REGLAS_EN_ORDEN);
    expect(falla(e)).toEqual([]);
    expect(e.resultado).toBe("comprar");
    expect(e.activoId).toBe("x-1");
    expect(e.resumen).toMatch(/^Compro: MercadoLibre, cheque de \$ 9\.000\.000 a 60 días/);
    expect(e.resumen).toContain("$ 8.640.157,81"); // el precio, con las cifras
    expect(e.resumen).toContain("$ 31.359.842,19"); // lo que queda del presupuesto
  });

  it("1 revocado: con el mandato revocado no se compra nada", () => {
    const e = evaluarMandato(activo(), cot(), revocarEstado(estadoBase()));
    expect(falla(e)).toEqual(["revocado"]);
    expect(e.resultado).toBe("omitir");
  });

  it("2 tipo: un pagaré no entra si el mandato solo acepta cheques (y un cheque sí)", () => {
    const e = evaluarMandato(activo({ tipo: "pagare" }), cot({ tipo: "pagare", cobertura: 11000 }), estadoBase({ tipos: ["cheque"] }));
    expect(falla(e)).toEqual(["tipo"]);
    expect(evaluarMandato(activo(), cot(), estadoBase({ tipos: ["cheque"] })).resultado).toBe("comprar");
  });

  it("3 plazo: cumple en el borde (dias == plazoMaxDias) y no cumple un día después", () => {
    expect(evaluarMandato(activo(), cot({ dias: 45 }), estadoBase({ plazoMaxDias: 45 })).resultado).toBe("comprar");
    expect(falla(evaluarMandato(activo(), cot({ dias: 46 }), estadoBase({ plazoMaxDias: 45 })))).toEqual(["plazo"]);
  });

  it("4 cotización: una cotización no aprobada no se compra, y tope y presupuesto dicen que no se pudieron evaluar", () => {
    const e = evaluarMandato(activo(), cot({ aprobada: false }), estadoBase());
    expect(falla(e)).toEqual(["cotizacion", "tope_emisor", "presupuesto"]);
    expect(e.razones.find((r) => r.regla === "cotizacion")?.mensaje).toContain("no aprobó");
    expect(e.razones.find((r) => r.regla === "presupuesto")?.mensaje).toContain("No se pudo evaluar");
    expect(e.resultado).toBe("omitir");
  });

  it("5 banda: A mejor que B mejor que C; con mínimo B entran A y B, no C ni D", () => {
    const quedan = (b: Banda, minima: "A" | "B" | "C") => evaluarMandato(activo(), cot({ banda: b }), estadoBase({ bandaMinima: minima })).resultado;
    expect(quedan("A", "B")).toBe("comprar");
    expect(quedan("B", "B")).toBe("comprar");
    expect(quedan("C", "B")).toBe("omitir");
    expect(quedan("D", "C")).toBe("omitir");
    expect(quedan("B", "A")).toBe("omitir");
    expect(quedan("C", "C")).toBe("comprar");
  });

  it("6 gestor: si el gestor rechaza, no se compra; aprobar con condiciones sí", () => {
    expect(falla(evaluarMandato(activo(), cot({ decision: "rechazar" }), estadoBase()))).toEqual(["gestor"]);
    expect(evaluarMandato(activo(), cot({ decision: "aprobar_con_condiciones" }), estadoBase()).resultado).toBe("comprar");
  });

  it("7 cobertura: pagaré con cobertura suficiente cumple; insuficiente no; sin garantía no cumple; cheque no la necesita; null no exige", () => {
    const pagare = (cobertura: number | null, m: Partial<Mandato> = {}) => evaluarMandato(activo({ tipo: "pagare" }), cot({ tipo: "pagare", cobertura }), estadoBase(m));
    expect(pagare(10000).resultado).toBe("comprar"); // 100 % justo
    expect(falla(pagare(9999))).toEqual(["cobertura"]);
    expect(falla(pagare(null))).toEqual(["cobertura"]); // pagaré sin garantía con cobertura exigida
    expect(pagare(null, { coberturaMinBps: null }).resultado).toBe("comprar");
    expect(evaluarMandato(activo(), cot(), estadoBase()).resultado).toBe("comprar"); // cheque sin garantía
  });

  it("8 emisor bloqueado: un emisor bloqueado no se compra (sin importar mayúsculas del hash)", () => {
    const bloqueado = { ...estadoBase(), emisoresBloqueados: [HASH_A.toUpperCase().replace("0X", "0x")] };
    expect(falla(evaluarMandato(activo(), cot({ hash: HASH_A }), bloqueado))).toEqual(["emisor_bloqueado"]);
    expect(evaluarMandato(activo(), cot({ hash: HASH_B }), bloqueado).resultado).toBe("comprar");
  });

  it("9 tope por emisor: se mide sobre el presupuesto, con exposición previa, exacto al centavo", () => {
    // presupuesto 40.000.000 × 35 % = 14.000.000
    const con = (expuesto: string, precio: string) => evaluarMandato(activo(), cot({ precio }), { ...estadoBase(), exposicionPorEmisor: { [HASH_A]: expuesto } });
    expect(con("0", "14000000").resultado).toBe("comprar"); // en el tope
    expect(falla(con("0", "14000000.01"))).toEqual(["tope_emisor"]);
    expect(con("8640157.81", "3882908.49").resultado).toBe("comprar"); // MercadoLibre 1 + 2: 12,52 M, el mandato lo deja pasar (el contrato no)
    expect(falla(con("8640157.81", "5359842.20"))).toEqual(["tope_emisor"]);
    const e = con("8640157.81", "5359842.20");
    expect(e.razones.find((r) => r.regla === "tope_emisor")?.mensaje).toContain("$ 14.000.000,01");
  });

  it("10 presupuesto: cumple con precio == disponible y no cumple con un centavo más", () => {
    const est = (disponible: string): EstadoMandato => ({ ...estadoBase({ topeEmisorBps: 10000 }), disponible });
    expect(evaluarMandato(activo(), cot({ precio: "5000000" }), est("5000000")).resultado).toBe("comprar");
    expect(falla(evaluarMandato(activo(), cot({ precio: "5000000.01" }), est("5000000")))).toEqual(["presupuesto"]);
  });

  it("11 aprobación: por encima del umbral queda pendiente (solo falla esa regla); en el umbral compra; null es autónomo", () => {
    const e = evaluarMandato(activo(), cot(), estadoBase({ aprobacionSobre: "5000000" }));
    expect(falla(e)).toEqual(["aprobacion"]);
    expect(e.resultado).toBe("pendiente_aprobacion");
    expect(e.resumen).toMatch(/^Espero tu aprobación/);
    expect(evaluarMandato(activo(), cot({ nominal: "5000000" }), estadoBase({ aprobacionSobre: "5000000" })).resultado).toBe("comprar");
    expect(evaluarMandato(activo(), cot(), estadoBase({ aprobacionSobre: null })).resultado).toBe("comprar");
  });

  it("si falla la aprobación y otra regla, el resultado es omitir (no se pide aprobar algo que ya no entra)", () => {
    const e = evaluarMandato(activo(), cot({ dias: 80 }), estadoBase({ aprobacionSobre: "1000", plazoMaxDias: 30 }));
    expect(falla(e)).toEqual(["plazo", "aprobacion"]);
    expect(e.resultado).toBe("omitir");
  });

  it("junta TODAS las razones que fallan, en orden, y el resumen las nombra con cifras", () => {
    const e = evaluarMandato(activo({ tipo: "pagare" }), cot({ tipo: "pagare", dias: 120, banda: "C", decision: "rechazar", cobertura: 5000, precio: "50000000" }), { ...estadoBase({ tipos: ["cheque"] }), emisoresBloqueados: [HASH_A] });
    expect(falla(e)).toEqual(["tipo", "plazo", "banda", "gestor", "cobertura", "emisor_bloqueado", "tope_emisor", "presupuesto"]);
    expect(e.resultado).toBe("omitir");
    expect(e.resumen).toMatch(/^Omito: MercadoLibre, pagaré de \$ 9\.000\.000 a 120 días\. No cumple 8 reglas/);
    expect(e.resumen).toContain("$ 50.000.000");
  });

  it("toma tipo, plazo y nominal de la cotización firmada, no del activo que mandó el navegador", () => {
    const e = evaluarMandato(activo({ tipo: "pagare", dias: 1, nominal: "1" }), cot({ tipo: "cheque", dias: 60 }), estadoBase({ tipos: ["cheque"], plazoMaxDias: 90 }));
    expect(e.resultado).toBe("comprar");
  });

  it("los textos no usan palabras prohibidas", () => {
    const e = evaluarMandato(activo(), cot({ decision: "rechazar", dias: 200 }), estadoBase());
    expect(JSON.stringify(e.razones) + e.resumen).not.toMatch(/rinde|rendimiento|\bIA\b|\bAI\b/i);
  });
});

describe("estado del mandato", () => {
  it("el estado inicial tiene todo el presupuesto disponible y nada invertido", () => {
    expect(estadoBase()).toMatchObject({ invertido: "0", disponible: "40000000", exposicionPorEmisor: {}, emisoresBloqueados: [], compras: [], revocado: false });
  });

  it("aplicar una compra sube invertido y la exposición del emisor, baja disponible y no muta el original", () => {
    const e0 = estadoBase();
    const e1 = aplicarCompra(e0, compra());
    expect(e1).toMatchObject({ invertido: "8640157.81", disponible: "31359842.19", exposicionPorEmisor: { [HASH_A]: "8640157.81" } });
    expect(e1.compras).toHaveLength(1);
    expect(e0.compras).toHaveLength(0);
    const e2 = aplicarCompra(e1, compra({ activoId: "a2", chequeId: `0x${"2".repeat(64)}`, precioCompra: "3882908.49" }));
    expect(e2).toMatchObject({ invertido: "12523066.3", disponible: "27476933.7", exposicionPorEmisor: { [HASH_A]: "12523066.3" } });
  });

  it("aplicar un rebote baja invertido y la exposición, marca Rejected y bloquea al emisor", () => {
    const e = aplicarCompra(aplicarCompra(estadoBase(), compra({ libradorHash: HASH_B, chequeId: `0x${"3".repeat(64)}`, activoId: "a3", precioCompra: "4800087.67", nombre: "Cencosud" })), compra());
    const r = aplicarRebote(e, `0x${"3".repeat(64)}`);
    expect(r.invertido).toBe("8640157.81");
    expect(r.disponible).toBe("31359842.19");
    expect(r.exposicionPorEmisor).toEqual({ [HASH_A]: "8640157.81" }); // la del emisor rebotado se va
    expect(r.emisoresBloqueados).toEqual([HASH_B]);
    expect(r.compras.map((c) => c.estado)).toEqual(["Rejected", "Funded"]);
  });

  it("no se puede rebotar dos veces ni algo que no es del mandato", () => {
    const e = aplicarCompra(estadoBase(), compra());
    const r = aplicarRebote(e, compra().chequeId);
    expect(() => aplicarRebote(r, compra().chequeId)).toThrow(/ya no está fondeada/);
    expect(() => aplicarRebote(e, `0x${"9".repeat(64)}`)).toThrow(/no es una compra/);
  });

  describe("firma", () => {
    const firmado = () => firmarEstado(aplicarRebote(aplicarCompra(estadoBase(), compra()), compra().chequeId));
    it("un estado firmado se verifica y vuelve idéntico", () => {
      const f = firmado();
      expect(f.firma).toMatch(/^\d+\.[0-9a-f]{64}$/);
      expect(verificarEstado(JSON.parse(JSON.stringify(f)))).toEqual(f);
    });
    it("alterar `invertido`, `disponible`, el presupuesto o `revocado` invalida la firma", () => {
      const f = firmado();
      expect(verificarEstado({ ...f, invertido: "1" })).toBeNull();
      expect(verificarEstado({ ...f, disponible: "99999999" })).toBeNull();
      expect(verificarEstado({ ...f, mandato: { ...f.mandato, presupuesto: "99999999" } })).toBeNull();
      expect(verificarEstado({ ...f, revocado: !f.revocado })).toBeNull();
      expect(verificarEstado({ ...f, exposicionPorEmisor: { [HASH_A]: "1" } })).toBeNull();
    });
    it("quitar un bloqueo invalida la firma", () => {
      const f = firmado();
      expect(f.emisoresBloqueados).toHaveLength(1);
      expect(verificarEstado({ ...f, emisoresBloqueados: [] })).toBeNull();
    });
    it("sin firma, con una firma mal formada o vencida, no vale", () => {
      const f = firmado();
      const { firma: _f, ...sin } = f;
      void _f;
      expect(verificarEstado(sin)).toBeNull();
      expect(verificarEstado({ ...f, firma: "x" })).toBeNull();
      expect(verificarEstado(f, Date.now() + 13 * 3600 * 1000)).toBeNull();
      for (const x of [null, undefined, "x", 1, []]) expect(verificarEstado(x)).toBeNull();
    });
    it("la firma de un estado no sirve para otro", () => {
      const a = firmado();
      const b = firmarEstado(estadoBase({ presupuesto: "1000000" }));
      expect(verificarEstado({ ...b, firma: a.firma })).toBeNull();
    });
  });
});

describe("informe", () => {
  const fondo = (patrimonio: string, liquidezBps: number, cuota: string) => ({ totalAssets: patrimonio, liquidezBps, valorCuotaparte: cuota }) as ResumenFondo;
  const ev = (activoId: string, resultado: EvaluacionMandato["resultado"], reglas: ReglaMandato[] = []): EvaluacionMandato => ({
    activoId,
    resultado,
    razones: reglas.map((regla) => ({ regla, cumple: false, mensaje: regla })),
    cotizacion: cot(),
    resumen: "",
  });

  it("junta comprados, omitidos, rechazados por el contrato, rebotes y emisores bloqueados, y no muta nada", () => {
    const estado = aplicarRebote(aplicarCompra(aplicarCompra(estadoBase(), compra()), compra({ activoId: "c4", nombre: "Cencosud", libradorHash: HASH_B, chequeId: `0x${"4".repeat(64)}`, precioCompra: "4800087.67" })), `0x${"4".repeat(64)}`);
    const evaluaciones = [ev("a1", "comprar"), ev("a2", "comprar"), ev("a8", "omitir", ["cobertura"]), ev("a1", "comprar")];
    const rebote = { chequeId: `0x${"4".repeat(64)}`, emisorBloqueado: "Cencosud", perdida: "4800087.67" } as ReboteMandato;
    const copia = JSON.stringify({ estado, evaluaciones });
    const informe = armarInforme({
      estado,
      evaluaciones,
      ejecuciones: [
        { activoId: "a1", estado, compra: compra(), rechazoContrato: null },
        { activoId: "a2", estado, compra: null, rechazoContrato: { codigo: "CONCENTRACION_EXCEDIDA", mensaje: "supera el 10 %" } },
      ],
      rebotes: [rebote],
      antes: fondo("100000000", 10000, "1000"),
      despues: fondo("95199912.33", 7000, "951.99"),
      activos: [activo({ id: "a1" }), activo({ id: "a2" }), activo({ id: "a8", nombre: "Pampa Energía" })],
      ahora: new Date("2026-11-07T18:00:00Z"),
    });
    expect(JSON.stringify({ estado, evaluaciones })).toBe(copia);
    expect(informe.generadoEn).toBe("2026-11-07T18:00:00.000Z");
    expect(informe.antes).toEqual({ patrimonio: "100000000", liquidezBps: 10000, valorCuotaparte: "1000" });
    expect(informe.despues).toEqual({ patrimonio: "95199912.33", liquidezBps: 7000, valorCuotaparte: "951.99" });
    expect(informe.comprados.map((c) => `${c.nombre}:${c.estado}`)).toEqual(["MercadoLibre:Funded", "Cencosud:Rejected"]);
    expect(informe.omitidos).toEqual([{ activoId: "a8", nombre: "Pampa Energía", razones: evaluaciones[2].razones }]);
    expect(informe.rechazadosPorContrato).toEqual([{ activoId: "a2", nombre: "MercadoLibre", codigo: "CONCENTRACION_EXCEDIDA", mensaje: "supera el 10 %" }]);
    expect(informe.rebotes).toEqual([{ chequeId: rebote.chequeId, nombre: "Cencosud", perdida: "4800087.67" }]);
    expect(informe.emisoresBloqueados).toEqual(["Cencosud"]);
    expect(informe).toMatchObject({ invertido: estado.invertido, disponible: estado.disponible, mandato: estado.mandato });
  });

  it("si un activo se evaluó dos veces vale la última, y uno comprado después ya no figura como omitido", () => {
    const estado = aplicarCompra(estadoBase(), compra({ activoId: "a7" }));
    const informe = armarInforme({
      estado,
      evaluaciones: [ev("a7", "omitir", ["presupuesto"]), ev("a7", "comprar")],
      ejecuciones: [],
      rebotes: [],
      antes: fondo("1", 1, "1"),
      despues: fondo("1", 1, "1"),
    });
    expect(informe.omitidos).toEqual([]);
  });

  it("un activo en espera de aprobación figura como omitido (con su razón)", () => {
    const informe = armarInforme({ estado: estadoBase(), evaluaciones: [ev("a5", "pendiente_aprobacion", ["aprobacion"])], ejecuciones: [], rebotes: [], antes: fondo("1", 1, "1"), despues: fondo("1", 1, "1") });
    expect(informe.omitidos.map((o) => [o.activoId, o.nombre, o.razones[0].regla])).toEqual([["a5", "MERCADOLIBRE S.R.L.", "aprobacion"]]);
  });
});

describe("replanificación", () => {
  const previa = (activoId: string, fallan: ReglaMandato[], libradorHash?: string) => ({ activoId, razones: fallan.map((regla) => ({ regla, cumple: false })), ...(libradorHash ? { libradorHash } : {}) });
  const estado = aplicarRebote(aplicarCompra(estadoBase(), compra({ libradorHash: HASH_B })), compra().chequeId);

  it("incluye solo lo omitido por presupuesto o tope de emisor, que no se compró y cuyo emisor no está bloqueado", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const previas = [previa("a", ["presupuesto"]), previa("b", ["tope_emisor", "presupuesto"]), previa("c", ["cobertura"]), previa("d", ["presupuesto"], HASH_B), previa("e", ["presupuesto", "banda"]), previa("f", [])];
    expect(activosParaReplanificar(estado, ids, previas)).toEqual(["a", "b"]);
  });
  it("no incluye lo ya comprado ni lo que no tiene evaluación; y sin disponible no hay nada", () => {
    const comprado = aplicarCompra(estado, compra({ activoId: "a", chequeId: `0x${"5".repeat(64)}` }));
    expect(activosParaReplanificar(comprado, ["a", "z"], [previa("a", ["presupuesto"])])).toEqual([]);
    expect(activosParaReplanificar({ ...estado, disponible: "0" }, ["a"], [previa("a", ["presupuesto"])])).toEqual([]);
  });
  it("vale la última evaluación de cada activo", () => {
    expect(activosParaReplanificar(estado, ["a"], [previa("a", ["presupuesto"]), previa("a", [])])).toEqual([]);
  });
});

describe("bandeja de la demo", () => {
  const { activos, mandatoPorDefecto } = leerBandeja();
  const cuitsConocidos = new Set([...cuitsDemo.cheques.map((c) => c.librador_cuit), cuitsDemo.suplente.librador_cuit]);

  it("son los 8 activos de la spec, en orden, y el mandato por defecto (con el tope ajustado: ver _nota del fixture)", () => {
    expect(activos.map((a) => [a.nombre, a.tipo, a.nominal, a.dias])).toEqual([
      ["MercadoLibre", "cheque", "9000000", 60],
      ["MercadoLibre", "cheque", "4000000", 45],
      ["Coto", "cheque", "6000000", 30],
      ["Cencosud", "cheque", "5000000", 60],
      ["Pampa Energía", "pagare", "8000000", 90],
      ["Loma Negra", "pagare", "6000000", 60],
      ["Telecom", "cheque", "3000000", 90],
      ["Pampa Energía", "pagare", "3000000", 60],
    ]);
    expect(mandatoPorDefecto).toEqual({ presupuesto: "40000000", bandaMinima: "B", topeEmisorBps: 3500, plazoMaxDias: 90, tipos: ["cheque", "pagare"], coberturaMinBps: 10000, aprobacionSobre: null });
  });
  it("usa solo CUIT que ya están en shared/fixtures (cheques-demo.json) y que tienen su respuesta del BCRA guardada", () => {
    for (const a of activos) {
      expect(cuitsConocidos.has(a.cuit), a.cuit).toBe(true);
      expect(existsSync(new URL(`../../../shared/fixtures/bcra/${a.cuit}.json`, import.meta.url)), a.cuit).toBe(true);
    }
  });
  it("el único con reboteSimulado es Cencosud", () => {
    expect(activos.filter((a) => a.reboteSimulado).map((a) => a.nombre)).toEqual(["Cencosud"]);
  });
  it("la cobertura de las garantías es la de la spec, calculada con analizarGarantiaBase real: turbina y camión ≥ 100 %, terreno < 100 %", () => {
    const cobertura = (i: number) => {
      const a = activos[i];
      return analizarGarantiaBase(a.garantia!, a.nominal).coberturaBps;
    };
    expect(analizarGarantiaBase(activos[4].garantia!, "8000000").haircutBps).toBe(4500);
    expect(analizarGarantiaBase(activos[5].garantia!, "6000000").haircutBps).toBe(3000);
    expect(analizarGarantiaBase(activos[7].garantia!, "3000000").haircutBps).toBe(3500);
    expect(cobertura(4)).toBeGreaterThanOrEqual(10000);
    expect(cobertura(5)).toBeGreaterThanOrEqual(10000);
    expect(cobertura(7)).toBeLessThan(10000);
  });
  it("validarBandeja rechaza ids repetidos y un mandato inválido", () => {
    const b = { mandatoPorDefecto, activos };
    expect(() => validarBandeja({ ...b, activos: [activos[0], activos[0]] })).toThrow(/repetidos/);
    expect(() => validarBandeja({ ...b, mandatoPorDefecto: { ...mandatoPorDefecto, plazoMaxDias: 0 } })).toThrow(/mandato por defecto/);
    expect(() => validarBandeja({ ...b, activos: [] })).toThrow(/activos/);
  });
  it("leerBandeja devuelve copias: modificar una no cambia la siguiente", () => {
    leerBandeja().activos[0].nominal = "1";
    expect(leerBandeja().activos[0].nominal).toBe("9000000");
  });
});

describe("vencimiento y eventos", () => {
  it("vencimientoEn suma días a la fecha de Buenos Aires", () => {
    expect(vencimientoEn(60, new Date("2026-11-03T15:00:00Z"))).toBe("2027-01-02");
    expect(vencimientoEn(0, new Date("2026-11-03T02:00:00Z"))).toBe("2026-11-02"); // en Buenos Aires todavía es el 2
  });
  it("parsearEventoMandato acepta pasos y la evaluación final, y rechaza el resultado del agente", () => {
    expect(parsearEventoMandato(JSON.stringify({ tipo: "paso", paso: { n: 1 } })).tipo).toBe("paso");
    expect(parsearEventoMandato(JSON.stringify({ tipo: "evaluacion", evaluacion: {} })).tipo).toBe("evaluacion");
    expect(() => parsearEventoMandato(JSON.stringify({ tipo: "resultado", resultado: {} }))).toThrow();
  });
});
