// Reglas de puntaje (INTERFACES.md, enchufe 2; deck, slide 21). Función pura: no toca la red.
import type { Banda, ResultadoScoring } from "@/shared/types";
import { ajustesAntecedentes, antecedentesCheques, esAdministrativo } from "./antecedentes";
import type { DatosBcra } from "./bcra-tipos";

export const VENTANA_RECHAZOS_MESES = 12;
export const MESES_COMPARACION_DEUDA = 6;
const MARGEN_DEUDA_CRECIENTE = 10n; // % sobre el total de hace 6 meses
export const MARGEN_DEUDA_CRECIENTE_PCT = Number(MARGEN_DEUDA_CRECIENTE);
// Penalizaciones (puntos que se restan de 100). Exportadas para que la pantalla de políticas lea los mismos valores.
export const PENALIZACION_POR_NIVEL_SITUACION = 15; // por cada nivel peor que 1
export const PENALIZACION_RECHAZADOS_IMPAGOS = 25;
export const PENALIZACION_REFINANCIACIONES = 10;
export const PENALIZACION_DEUDA_CRECIENTE = 5;
/** Una entidad con situación mala pesa solo si su deuda es al menos este % de la deuda total (YPF salía banda D por 86 mil pesos de 1,1 billones en TELEPEAJE). TODO(confirmar con Facu). */
export const UMBRAL_MATERIALIDAD_PCT = 1;
/** Puntos por proceso judicial o situación jurídica (concurso, quiebra) informados por el BCRA. TODO(confirmar con Facu). */
export const PENALIZACION_JURIDICA = -20;

export function bandaDe(puntaje: number): Banda {
  if (puntaje >= 85) return "A";
  if (puntaje >= 70) return "B";
  if (puntaje >= 55) return "C";
  return "D";
}

/** Resta meses a una fecha AAAA-MM-DD (para la ventana de 12 meses). */
function restarMeses(hoy: string, meses: number): string {
  const [a, m, d] = hoy.split("-").map(Number);
  const total = a * 12 + (m - 1) - meses;
  const aa = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${aa}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Período AAAAMM de hace `meses` meses. */
function periodoAnterior(periodo: string, meses: number): string {
  const total = Number(periodo.slice(0, 4)) * 12 + (Number(periodo.slice(4, 6)) - 1) - meses;
  return `${Math.floor(total / 12)}${String((total % 12) + 1).padStart(2, "0")}`;
}

export const fechaHoyBA = (ahora: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora);

export function calcularPuntaje(datos: DatosBcra, ahora: Date = new Date()): ResultadoScoring {
  const ajustes: { motivo: string; puntos: number }[] = [];

  // −15 por cada nivel de situación peor que 1 (la peor entidad con deuda material; situación 0 = sin deuda, se ignora)
  const conDeuda = datos.entidadesActuales.filter((e) => e.situacion >= 1);
  const deudaTotal = conDeuda.reduce((acc, e) => acc + e.monto, 0);
  const esMaterial = (e: { monto: number }) => deudaTotal <= 0 || e.monto * 100 >= deudaTotal * UMBRAL_MATERIALIDAD_PCT;
  const materiales = conDeuda.filter(esMaterial);
  const peor = materiales.reduce((m, e) => Math.max(m, e.situacion), 1);
  if (peor > 1) {
    const ent = materiales.find((e) => e.situacion === peor);
    ajustes.push({ motivo: `Situación ${peor} en ${ent?.entidad ?? "una entidad"}`, puntos: -PENALIZACION_POR_NIVEL_SITUACION * (peor - 1) });
  }
  // Las situaciones malas de deudas irrelevantes no restan, pero se informan para que se vean.
  const irrelevantes = conDeuda.filter((e) => e.situacion > 1 && !esMaterial(e));
  if (irrelevantes.length > 0) {
    const e = irrelevantes.reduce((a, b) => (b.situacion > a.situacion ? b : a));
    const pct = deudaTotal > 0 ? ((e.monto / deudaTotal) * 100).toFixed(2).replace(".", ",") : "0";
    ajustes.push({ motivo: `Antecedente sin penalización: situación ${e.situacion} en ${e.entidad}, pero es el ${pct} % de la deuda (menos del ${UMBRAL_MATERIALIDAD_PCT} %)`, puntos: 0 });
  }

  // −20 si el BCRA informa proceso judicial o situación jurídica en alguna entidad con deuda
  const juridica = conDeuda.find((e) => e.juridico);
  if (juridica) ajustes.push({ motivo: `Proceso judicial o situación jurídica informada por el BCRA (${juridica.entidad})`, puntos: PENALIZACION_JURIDICA });

  // −25 si hay cheques rechazados sin pagar en los últimos 12 meses (sin contar los defectos formales)
  const desde = restarMeses(fechaHoyBA(ahora), VENTANA_RECHAZOS_MESES);
  const impagos = datos.rechazados.filter(
    (c) => c.impago && c.fechaRechazo >= desde && !esAdministrativo(c),
  );
  if (impagos.length > 0) {
    ajustes.push({ motivo: `${impagos.length} cheque${impagos.length > 1 ? "s" : ""} rechazado${impagos.length > 1 ? "s" : ""} sin pagar en los últimos 12 meses`, puntos: -PENALIZACION_RECHAZADOS_IMPAGOS });
  }

  // Antecedentes sin penalización (viejos, pagados o por defectos formales): se informan con 0 puntos para que se vean.
  const sinPenalizar = datos.rechazados.filter((c) => !impagos.includes(c) && (!c.impago || esAdministrativo(c))).sort((a, b) => b.fechaRechazo.localeCompare(a.fechaRechazo));
  if (sinPenalizar.length > 0) {
    const u = sinPenalizar[0];
    const [aa, mm, dd] = u.fechaRechazo.split("-");
    ajustes.push({
      motivo: `Antecedente sin penalización: ${sinPenalizar.length} cheque${sinPenalizar.length > 1 ? "s" : ""} rechazado${sinPenalizar.length > 1 ? "s" : ""} (el último el ${Number(dd)}/${Number(mm)}/${aa}, ${u.causal.toLowerCase()}), fuera de la ventana de 12 meses, ya pagado o sin relación con la capacidad de pago`,
      puntos: 0,
    });
  }

  // Exclusiones (impago confirmado de cualquier antigüedad, en revisión, sin verificar): 0 puntos, las aplica cotizar().
  ajustes.push(...ajustesAntecedentes(antecedentesCheques(datos)));

  // −10 si hay refinanciaciones
  const refinanciaciones = conDeuda.some((e) => e.refinanciaciones);
  if (refinanciaciones) ajustes.push({ motivo: "Tiene refinanciaciones", puntos: -PENALIZACION_REFINANCIACIONES });

  // −5 si la deuda total creció más de 10 % respecto de hace 6 meses
  // Se compara por etiqueta de período (no por posición): si falta un mes en la serie, no se compara contra otro distinto.
  const serie = datos.deudaPorPeriodo;
  const ahoraTotal = serie[0]?.total;
  const antes = serie[0] ? serie.find((p) => p.periodo === periodoAnterior(serie[0].periodo, MESES_COMPARACION_DEUDA))?.total : undefined;
  const deudaCreciente =
    ahoraTotal !== undefined && antes !== undefined && antes > 0 && BigInt(Math.round(ahoraTotal)) * 100n > BigInt(Math.round(antes)) * (100n + MARGEN_DEUDA_CRECIENTE);
  if (deudaCreciente) ajustes.push({ motivo: "La deuda creció más de 10 % en los últimos 6 meses", puntos: -PENALIZACION_DEUDA_CRECIENTE });

  const puntaje = Math.max(0, Math.min(100, 100 + ajustes.reduce((s, a) => s + a.puntos, 0)));
  return {
    cuit: datos.cuit,
    denominacion: datos.denominacion,
    puntaje,
    banda: bandaDe(puntaje),
    situacionPeor: peor,
    chequesRechazadosImpagos: impagos.length,
    refinanciaciones,
    deudaCreciente,
    ajustes,
    fuente: datos.fuente,
    consultadoEn: datos.consultadoEn,
  };
}
