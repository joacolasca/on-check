// Informe del activo (cheque o pagaré): función pura (sin red) que separa lo que verifica el sistema (reglas determinísticas, decisión)
// de lo que explica el agente (`agente`). La decisión es la del backend, no la del agente. Lo importa también la UI: no usar nada de servidor acá.
// El informe es público: nunca lleva el CUIT completo, ni siquiera si el agente lo repite en sus textos.
import { parseUnits } from "viem";
import { formatBps, formatPesos } from "@/lib/format";
import { CONFIG_FONDO, PUNTAJE_MINIMO } from "@/lib/scoring/config";
import { MARCA_IMPAGO, motivoExclusionDe } from "@/lib/scoring/antecedentes";
import type { Banda, DecisionPM, GarantiaAnalisis, IndustriaEstimada, MavConsulta, PoliticaFondo, TipoActivo } from "@/shared/types";
import type { PasoAgente, ResultadoAgente } from "./types";

/** Nivel de riesgo por banda. Un solo lugar para el mapeo. */
export const NIVEL_RIESGO: Record<Banda, string> = { A: "Bajo", B: "Moderado", C: "Alto", D: "Muy alto" };

export interface ReglaInforme {
  id: string;
  regla: string;
  /** null = no se evaluó o no se pudo verificar. */
  cumple: boolean | null;
  /** "sistema" = lo verificó el backend al cotizar; "contrato" = lo hace cumplir el contrato al comprar (acá solo se muestra la proyección). */
  verifica: "sistema" | "contrato";
  detalle: string;
}

export interface InformeActivo {
  version: 2;
  generadoEn: string;
  cotizacion: { id: string; cotizacionHash: string };
  /** Reglas del fondo: las que verifica el sistema y las que verifica el contrato. */
  reglas: ReglaInforme[];
  /** Decisión automática del backend (la que mandan las reglas). */
  decision: { aprobada: boolean; motivo: string | null };
  empresa: {
    denominacion: string | null;
    cuitEnmascarado: string;
    banda: Banda;
    nivelRiesgo: string;
    puntaje: number;
    situacionPeor: number;
    chequesRechazadosImpagos: number;
    refinanciaciones: boolean;
    deudaCreciente: boolean;
    ajustes: { motivo: string; puntos: number }[];
    fuente: "bcra-live" | "bcra-cache";
    consultadoEn: string;
  };
  activo: {
    tipo: TipoActivo;
    nominal: string;
    vencimiento: string;
    dias: number;
    tasaTnaBps: number;
    descuento: string;
    precioCompra: string;
    /** Estimada con el descuento y el plazo; null si el activo no se aprobó. */
    rentabilidadEsperada: { etiqueta: string; periodo: string; anualizada: string; nota: string } | null;
  };
  /** Análisis de la garantía (solo si el vendedor ofreció una). */
  garantia: GarantiaAnalisis | null;
  industria: IndustriaEstimada | null;
  mav: MavConsulta | null;
  alertas: string[];
  /** Parte explicativa del agente: no son reglas. */
  agente: { modo: "agente" | "determinista"; recomendacion: DecisionPM["decision"] | null; explicacion: string; pasos: PasoAgente[] };
}
/** Nombre histórico (v1): mismo tipo. */
export type InformeCheque = InformeActivo;

const PROHIBIDO = /rinde|rendimiento garantizado/i;
const CUIT_EN_TEXTO = /\b\d{2}-?\d{8}-?\d\b/g;
/** Saca las palabras prohibidas y enmascara cualquier CUIT que el agente haya repetido en su texto (el informe es público). */
const limpiar = (t: string): string =>
  (PROHIBIDO.test(t) ? t.replace(/rendimiento garantizado/gi, "resultado esperado").replace(/rinde/gi, "genera") : t).replace(CUIT_EN_TEXTO, (m) => enmascararCuit(m));
const limpiarLista = (l: string[]): string[] => l.map(limpiar);

/** Solo quedan visibles los últimos 3 dígitos: `**-******85-4`. El informe es público: nunca lleva el CUIT completo. */
export function enmascararCuit(cuit: string): string {
  const d = cuit.replace(/\D/g, "");
  if (d.length === 11) return `**-******${d.slice(8, 10)}-${d[10]}`;
  return `${"*".repeat(Math.max(0, d.length - 3))}${d.slice(-3)}`;
}

/**
 * Rentabilidad esperada = descuento / precio de compra sobre el plazo, y su equivalente anual simple (× 365 / días).
 * Con bigint; es una estimación: depende de que el emisor pague.
 */
export function rentabilidadEsperada(descuento: string, precioCompra: string, dias: number): { periodoBps: number; anualizadaBps: number } | null {
  if (!(dias > 0)) return null;
  const d = parseUnits(descuento, 18);
  const p = parseUnits(precioCompra, 18);
  if (p <= 0n || d < 0n) return null;
  const periodo = (d * 10_000n) / p;
  const anual = (d * 10_000n * 365n) / (p * BigInt(dias));
  return { periodoBps: Number(periodo), anualizadaBps: Number(anual) };
}

export interface ExtraInforme {
  generadoEn: string;
}

type Exclusion = { tipo: "impago" | "sin_verificar"; motivo: string };
function exclusionDe(ajustes: { motivo: string }[]): Exclusion | null {
  const motivo = motivoExclusionDe(ajustes);
  if (motivo === null) return null;
  return { tipo: ajustes.some((a) => a.motivo.startsWith(MARCA_IMPAGO)) ? "impago" : "sin_verificar", motivo };
}

/** Regla que hace cumplir el contrato: se muestra la proyección si el agente la calculó; `cumple` queda en null si no se evaluó. */
function reglaDelContrato(id: string, regla: string, proyectado: number | null, limite: number | null, mayorEsMejor: boolean, detalle: (bps: number) => string, sinDato: string): ReglaInforme {
  if (proyectado === null) return { id, regla, cumple: null, verifica: "contrato", detalle: `Lo verifica el contrato al comprar. ${sinDato}` };
  const cumple = limite === null ? null : mayorEsMejor ? proyectado >= limite : proyectado <= limite;
  return { id, regla, cumple, verifica: "contrato", detalle: `Lo verifica el contrato al comprar. ${detalle(proyectado)}` };
}

export function armarInforme(resultado: ResultadoAgente, extra: ExtraInforme): InformeActivo {
  const cot = resultado.cotizacion;
  const s = cot.scoring;
  const exclusion = exclusionDe(s.ajustes);
  const { plazoMaxDias, nominalMin, nominalMax } = CONFIG_FONDO;
  const nominalOk = (() => {
    const n = parseUnits(cot.input.nominal, 18);
    return n >= parseUnits(nominalMin, 18) && n <= parseUnits(nominalMax, 18);
  })();
  const tipo: TipoActivo = cot.tipo ?? cot.input.tipo ?? "cheque";
  const palabra = tipo === "pagare" ? "pagaré" : "cheque";
  const emisor = tipo === "pagare" ? "suscriptor" : "librador";
  const proy = resultado.proyecciones;
  const politica: PoliticaFondo | null = proy?.politica ?? null;
  // Sin cotización aprobada no hay compra que proyectar: las reglas del contrato quedan sin evaluar.
  const emisorBps = cot.aprobada ? (proy?.emisorBps ?? null) : null;
  const industriaBps = cot.aprobada ? (proy?.industriaBps ?? null) : null;
  const liquidezBps = cot.aprobada ? (proy?.liquidezPosteriorBps ?? null) : null;
  const sinDato = "No se evaluó (cartera no disponible, fondo vacío o activo ya rechazado por otra regla).";

  const reglas: ReglaInforme[] = [
    {
      id: "puntaje",
      regla: `Puntaje del ${emisor} de ${PUNTAJE_MINIMO} o más`,
      cumple: s.puntaje >= PUNTAJE_MINIMO,
      verifica: "sistema",
      detalle: `Puntaje ${s.puntaje}/100 (mínimo ${PUNTAJE_MINIMO}).`,
    },
    {
      id: "impagos",
      regla: "Sin cheques rechazados impagos confirmados por el BCRA",
      cumple: exclusion?.tipo === "impago" ? false : exclusion?.tipo === "sin_verificar" ? null : true,
      verifica: "sistema",
      detalle: exclusion ? exclusion.motivo : "El BCRA no informa cheques rechazados impagos confirmados del emisor.",
    },
    {
      id: "antecedentes",
      regla: "Antecedentes del BCRA verificados",
      cumple: exclusion?.tipo === "sin_verificar" ? false : true,
      verifica: "sistema",
      detalle: exclusion?.tipo === "sin_verificar" ? exclusion.motivo : `Consulta a la Central de Deudores del BCRA (${s.fuente === "bcra-live" ? "en vivo" : "copia guardada"}).`,
    },
    {
      id: "plazo",
      regla: `Plazo de hasta ${plazoMaxDias} días`,
      cumple: cot.dias > 0 && cot.dias <= plazoMaxDias,
      verifica: "sistema",
      detalle: `El ${palabra} vence en ${cot.dias} días.`,
    },
    {
      id: "monto",
      regla: `Monto entre ${formatPesos(nominalMin)} y ${formatPesos(nominalMax)}`,
      cumple: nominalOk,
      verifica: "sistema",
      detalle: `Valor nominal ${formatPesos(cot.input.nominal)}.`,
    },
    reglaDelContrato(
      "concentracion",
      `Concentración del ${emisor} de ${politica ? formatBps(politica.maxEmisorBps) : "el tope del fondo"} o menos`,
      emisorBps,
      politica?.maxEmisorBps ?? null,
      false,
      (b) => `Con este ${palabra} el ${emisor} quedaría en ${formatBps(b)} del fondo.`,
      sinDato,
    ),
    reglaDelContrato(
      "industria",
      `Industria con ${politica ? formatBps(politica.maxIndustriaBps) : "el tope del fondo"} del fondo o menos`,
      industriaBps,
      politica?.maxIndustriaBps ?? null,
      false,
      (b) => `Con este ${palabra} la industria quedaría en ${formatBps(b)} del fondo.`,
      sinDato,
    ),
    reglaDelContrato(
      "liquidez",
      `Liquidez de ${politica ? formatBps(politica.liquidezMinBps) : "el mínimo del fondo"} o más después de comprar`,
      liquidezBps,
      politica?.liquidezMinBps ?? null,
      true,
      (b) => `Después de pagar este ${palabra}, la liquidez quedaría en ${formatBps(Math.max(0, b))} del fondo.`,
      sinDato,
    ),
  ];

  const alertas = [...resultado.alertas];
  if (exclusion) alertas.push(exclusion.motivo);

  const r = cot.aprobada ? rentabilidadEsperada(cot.descuento, cot.precioCompra, cot.dias) : null;
  const g = cot.garantia;
  const i = cot.industria;
  return {
    version: 2,
    generadoEn: extra.generadoEn,
    cotizacion: { id: cot.id, cotizacionHash: cot.cotizacionHash },
    reglas,
    decision: { aprobada: cot.aprobada, motivo: cot.motivoRechazo === null ? null : limpiar(cot.motivoRechazo) },
    empresa: {
      denominacion: s.denominacion,
      cuitEnmascarado: enmascararCuit(s.cuit || cot.input.cuit),
      banda: s.banda,
      nivelRiesgo: NIVEL_RIESGO[s.banda],
      puntaje: s.puntaje,
      situacionPeor: s.situacionPeor,
      chequesRechazadosImpagos: s.chequesRechazadosImpagos,
      refinanciaciones: s.refinanciaciones,
      deudaCreciente: s.deudaCreciente,
      ajustes: s.ajustes.map((a) => ({ motivo: limpiar(a.motivo), puntos: a.puntos })),
      fuente: s.fuente,
      consultadoEn: s.consultadoEn,
    },
    activo: {
      tipo,
      nominal: cot.input.nominal,
      vencimiento: cot.input.vencimiento.slice(0, 10),
      dias: cot.dias,
      tasaTnaBps: cot.tasaTnaBps,
      descuento: cot.descuento,
      precioCompra: cot.precioCompra,
      rentabilidadEsperada: r
        ? {
            etiqueta: "Rentabilidad esperada (estimada, no garantizada)",
            periodo: formatBps(r.periodoBps),
            anualizada: formatBps(r.anualizadaBps),
            nota: `Es el descuento sobre lo que adelanta el fondo, en el plazo del ${palabra} y anualizado de forma simple. Solo se concreta si el emisor paga.`,
          }
        : null,
    },
    garantia: g
      ? { ...g, descripcion: limpiar(g.descripcion), riesgos: limpiarLista(g.riesgos), documentosPendientes: limpiarLista(g.documentosPendientes), observaciones: limpiar(g.observaciones) }
      : null,
    industria: i ? { ...i, nombre: limpiar(i.nombre), fundamento: limpiar(i.fundamento), fuentes: limpiarLista(i.fuentes) } : null,
    mav: cot.mav ? { ...cot.mav, nota: limpiar(cot.mav.nota) } : null,
    alertas: [...new Set(alertas.map(limpiar))],
    agente: {
      modo: resultado.modo,
      recomendacion: cot.decisionPM?.decision ?? null,
      explicacion: limpiar(cot.decisionPM?.resumen ?? cot.explicacion),
      pasos: resultado.pasos.map((p) => ({ ...p, titulo: limpiar(p.titulo), detalle: limpiar(p.detalle) })),
    },
  };
}

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Chequeo liviano para datos que vuelven de sessionStorage o de la red: forma mínima, no validación completa. */
export function esInformeCheque(v: unknown): v is InformeActivo {
  if (!esObj(v) || v.version !== 2) return false;
  const c = v.cotizacion;
  if (!esObj(c) || typeof c.id !== "string" || typeof c.cotizacionHash !== "string") return false;
  if (!Array.isArray(v.reglas) || !Array.isArray(v.alertas)) return false;
  if (!esObj(v.decision) || typeof v.decision.aprobada !== "boolean") return false;
  if (!esObj(v.empresa) || typeof v.empresa.puntaje !== "number" || typeof v.empresa.cuitEnmascarado !== "string") return false;
  if (!esObj(v.activo) || typeof v.activo.nominal !== "string" || typeof v.activo.precioCompra !== "string") return false;
  return esObj(v.agente) && typeof v.agente.explicacion === "string" && Array.isArray(v.agente.pasos);
}
