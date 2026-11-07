// Cotización: tasa, descuento comercial, adelanto, explicación y hashes verificables (D8, D9, D13).
import { keccak256, toBytes } from "viem";
import { DESCRIPCION_BANDA, formatBps, formatPesos } from "@/lib/format";
import type { ConfigFondo, Cotizacion, DecisionPM, GarantiaAnalisis, IndustriaEstimada, InputCotizacion, MavConsulta, ResultadoScoring } from "@/shared/types";
import { aCentavos, deCentavos, mulDiv } from "./dinero";
import { MARCA_IMPAGO, MARCA_SIN_VERIFICAR, motivoExclusionDe } from "./antecedentes";
import { PUNTAJE_MINIMO, SPREAD_POR_PUNTO_BPS, TASA_MAX_BPS, TASA_MIN_BPS, tasaPorPuntaje } from "./config";
import { fechaHoyBA } from "./puntaje";

const SALT_DE_DESARROLLO = "salt-de-desarrollo-no-usar-en-produccion";

/** JSON con las claves ordenadas, para que el mismo contenido dé siempre el mismo hash. */
export function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor !== null && typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(valor);
}

/** Lo que el gestor agrega a la cotización (v2). Todo opcional: sin esto, la cotización sale con industria "Sin clasificar". */
export interface ExtrasCotizacion {
  industria?: IndustriaEstimada;
  garantia?: GarantiaAnalisis;
  mav?: MavConsulta;
  decisionPM?: DecisionPM;
}

export const INDUSTRIA_SIN_CLASIFICAR: IndustriaEstimada = {
  id: 0,
  nombre: "Sin clasificar",
  fundamento: "Todavía no se estimó la industria del emisor.",
  fuentes: [],
  confianza: "baja",
};

/**
 * Campos v2 de la cotización. Los opcionales (garantia, mav, decisionPM) solo aparecen si existen: así el JSON canónico
 * (y el hash) de un caso sin ellos no cambia. `tipo` e `industria` son obligatorios y sí entran en el hash.
 */
export function camposV2(input: InputCotizacion, extras: ExtrasCotizacion = {}): Pick<Cotizacion, "tipo" | "industria" | "garantia" | "mav" | "decisionPM"> {
  return {
    tipo: input.tipo ?? "cheque",
    industria: extras.industria ?? INDUSTRIA_SIN_CLASIFICAR,
    ...(extras.garantia ? { garantia: extras.garantia } : {}),
    ...(extras.mav ? { mav: extras.mav } : {}),
    ...(extras.decisionPM ? { decisionPM: extras.decisionPM } : {}),
  };
}

/** El balance pegado por el usuario es confidencial y largo: se usa para analizar pero no viaja dentro de la cotización. */
export function inputPublico(input: InputCotizacion): InputCotizacion {
  const { balance: _balance, ...resto } = input;
  void _balance;
  return resto;
}

const aUTC = (iso: string): number => {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};
/** AAAA-MM-DD que existe en el calendario (rechaza "basura", "2027-1-2" y "2027-02-30", que Date.UTC corregiría en silencio al 2 de marzo). */
const esFechaIso = (iso: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(iso) && new Date(aUTC(iso)).toISOString().startsWith(iso);
const diasEntre = (desde: string, hasta: string): number => Math.round((aUTC(hasta) - aUTC(desde)) / 86_400_000);

/** keccak256 del JSON canónico de la cotización sin su propio hash (D8). Hay que recalcularlo si cambia cualquier campo, como la explicación. */
export function hashearCotizacion(sinHash: Omit<Cotizacion, "cotizacionHash">): string {
  return keccak256(toBytes(canonico(sinHash)));
}

/** ¿El hash de la cotización corresponde a su contenido? */
export function cotizacionIntegra(c: Cotizacion): boolean {
  const { cotizacionHash, ...sin } = c;
  return hashearCotizacion(sin) === cotizacionHash;
}

/** keccak256(cuit ‖ salt): el CUIT nunca va en claro onchain (D9). */
export function hashLibrador(cuit: string, salt: string): string {
  return keccak256(toBytes(`${cuit}${salt}`));
}

export function cotizar(
  input: InputCotizacion,
  scoring: ResultadoScoring,
  config: ConfigFondo,
  ahora: Date = new Date(),
  salt: string = process.env.CUIT_SALT || SALT_DE_DESARROLLO,
  extras: ExtrasCotizacion = {},
): Cotizacion {
  const cuit = input.cuit.replace(/\D/g, "");
  const vencimiento = input.vencimiento.slice(0, 10);
  if (!esFechaIso(vencimiento)) throw new Error(`Fecha de vencimiento inválida: "${input.vencimiento}" (se espera AAAA-MM-DD).`);
  const dias = diasEntre(fechaHoyBA(ahora), vencimiento);
  const nominalC = aCentavos(input.nominal);

  // Primero la exclusión por cheques rechazados (impago confirmado, en revisión o sin verificar): manda sobre cualquier otro motivo.
  const exclusion = motivoExclusionDe(scoring.ajustes);
  let motivoRechazo: string | null = exclusion;
  if (exclusion !== null) {
    // el motivo de exclusión ya está y no se pisa
  } else if (scoring.puntaje < PUNTAJE_MINIMO) motivoRechazo = `El puntaje del librador (${scoring.puntaje}/100) es menor al mínimo del fondo (${PUNTAJE_MINIMO}): no compramos sus cheques.`;
  else if (dias <= 0) motivoRechazo = "El cheque ya venció o vence hoy.";
  else if (dias > config.plazoMaxDias) motivoRechazo = `El plazo (${dias} días) supera el máximo del fondo (${config.plazoMaxDias} días).`;
  else if (nominalC < aCentavos(config.nominalMin)) motivoRechazo = `El monto es menor al mínimo del fondo (${formatPesos(config.nominalMin)}).`;
  else if (nominalC > aCentavos(config.nominalMax)) motivoRechazo = `El monto supera el máximo del fondo (${formatPesos(config.nominalMax)}).`;

  const aprobada = motivoRechazo === null;
  const tasa = tasaPorPuntaje(scoring.puntaje, config.tamarTnaBps);
  const tasaTnaBps = aprobada ? tasa.tasaBps : 0;
  const descuentoC = aprobada ? mulDiv(nominalC, BigInt(tasaTnaBps) * BigInt(dias), 10_000n * 365n) : 0n;
  const precioC = aprobada ? nominalC - descuentoC : 0n;

  const resta = scoring.ajustes.filter((a) => a.puntos < 0);
  const esExclusion = (m: string): boolean => m.startsWith(MARCA_IMPAGO) || m.startsWith(MARCA_SIN_VERIFICAR);
  const notas = scoring.ajustes.filter((a) => a.puntos === 0 && !esExclusion(a.motivo)); // la exclusión se dice una sola vez, como motivo de rechazo
  const ajustes =
    (resta.length
      ? ` Se restaron puntos por: ${resta.map((a) => `${a.motivo.charAt(0).toLowerCase()}${a.motivo.slice(1)} (${a.puntos})`).join("; ")}.`
      : exclusion !== null
        ? ""
        : " No encontramos atrasos, rechazos recientes ni refinanciaciones.") +
    (notas.length ? ` ${notas.map((a) => `${a.motivo}.`).join(" ")}` : "");
  const base = `El librador figura en banda ${scoring.banda} (${DESCRIPCION_BANDA[scoring.banda].toLowerCase()}) en la Central de Deudores del BCRA, con puntaje ${scoring.puntaje}/100.${ajustes}`;
  const ppSpread = String(tasa.spreadBps / 100).replace(".", ",");
  const limite = tasa.aplicado === "piso" ? ` (llevada al piso de ${formatBps(TASA_MIN_BPS)})` : tasa.aplicado === "tope" ? ` (llevada al tope de ${formatBps(TASA_MAX_BPS)})` : "";
  const explicacion = aprobada
    ? `${base} La tasa es la de referencia (TAMAR ${formatBps(config.tamarTnaBps)}) más un spread de ${ppSpread} pp por el puntaje (${String(SPREAD_POR_PUNTO_BPS / 100).replace(".", ",")} pp por cada punto que falta para 100)${limite}: ${formatBps(tasaTnaBps)} anual a ${dias} días, por eso se adelantan ${formatPesos(deCentavos(precioC))}.`
    : `${base} ${motivoRechazo}`;

  const sinHash: Omit<Cotizacion, "cotizacionHash"> = {
    ...camposV2(input, extras),
    id: keccak256(toBytes(canonico({ cuit, nominal: input.nominal, vencimiento: input.vencimiento, pyme: input.pyme, consultadoEn: scoring.consultadoEn, ...(input.tipo === "pagare" ? { tipo: input.tipo } : {}) }))),
    libradorHash: hashLibrador(cuit, salt),
    input: { ...inputPublico(input), cuit },
    scoring,
    dias,
    tasaTnaBps,
    descuento: deCentavos(descuentoC),
    precioCompra: deCentavos(precioC),
    aprobada,
    motivoRechazo,
    explicacion,
  };
  return { ...sinHash, cotizacionHash: hashearCotizacion(sinHash) };
}
