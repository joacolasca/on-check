// Políticas del fondo para la pantalla /politicas. Fuente única: arma el contenido desde las constantes reales del código
// (no repite números a mano). Función pura: se importa igual desde el cliente y desde el servidor. No cambia ninguna regla.
import type { Banda, TipoGarantia } from "@/shared/types";
import { POLITICA_POR_DEFECTO } from "@/lib/chain/politica";
import { NOMBRE_GARANTIA } from "@/lib/cotizacion";
import { formatBps, formatDecimal, formatPesos, DESCRIPCION_BANDA } from "@/lib/format";
import { PERFILES } from "@/lib/garantias";
import { CONFIG_FONDO, PUNTAJE_MINIMO, SPREAD_POR_PUNTO_BPS, TASA_MAX_BPS, TASA_MIN_BPS, tasaPorPuntaje } from "@/lib/scoring/config";
import {
  MARGEN_DEUDA_CRECIENTE_PCT,
  MESES_COMPARACION_DEUDA,
  PENALIZACION_DEUDA_CRECIENTE,
  PENALIZACION_JURIDICA,
  PENALIZACION_POR_NIVEL_SITUACION,
  PENALIZACION_REFINANCIACIONES,
  PENALIZACION_RECHAZADOS_IMPAGOS,
  UMBRAL_MATERIALIDAD_PCT,
  VENTANA_RECHAZOS_MESES,
  bandaDe,
} from "@/lib/scoring/puntaje";

/** Escala de situación del BCRA (1 = normal … 6 = irrecuperable por disposición técnica). */
const SITUACION_BCRA_MAX = 6;
const P = POLITICA_POR_DEFECTO;

export interface SeccionPolitica {
  id: string;
  texto: string;
}

export interface ReglaObligatoria {
  id: string;
  titulo: string;
  descripcion: string;
  /** Quién la hace cumplir, en palabras para un inversor. */
  aplica: "Sistema" | "Contrato" | "Sistema y contrato";
}

export interface FactorScoring {
  id: string;
  factor: string;
  comoSeMide: string;
  /** Puntos máximos que resta, sobre 100. */
  pesoMax: number;
  /** Texto del peso para mostrar, por ejemplo "−15 por nivel, hasta −75". */
  peso: string;
  /** El valor está marcado TODO(confirmar con Facu) en el código. */
  pendienteConfirmar?: boolean;
}

export interface FilaTasa {
  puntaje: number;
  banda: Banda;
  nivelRiesgo: string;
  /** null = por debajo del mínimo: no se compra. */
  tasaTnaBps: number | null;
  spreadBps: number;
  aplicado: "piso" | "tope" | null;
}

export interface FilaGarantia {
  tipo: TipoGarantia;
  nombre: string;
  haircutBps: number;
  liquidez: "alta" | "media" | "baja";
}

const pct = (bps: number): string => String(bps / 100).replace(".", ",");
const puntos = (n: number): string => `−${n}`;

export const SECCIONES: SeccionPolitica[] = [
  { id: "funcionamiento", texto: "Cómo funciona" },
  { id: "seleccion", texto: "Selección" },
  { id: "reglas", texto: "Reglas obligatorias" },
  { id: "puntaje", texto: "Puntaje" },
  { id: "garantias", texto: "Garantías" },
  { id: "tasa", texto: "Tasa" },
  { id: "objetivo", texto: "Objetivo" },
  { id: "cuotaparte", texto: "Cuotaparte" },
];

export const comoFunciona: string[] = [
  "El fondo compra cheques y pagarés de pymes antes de que venzan, con descuento: la pyme cobra hoy y el fondo cobra el valor nominal cuando el activo se paga.",
  "Las ganancias del fondo salen de ese descuento: la diferencia entre lo que pagó hoy y el valor nominal que cobra. El descuento es el valor nominal por la tasa anual por los días, sobre 365.",
  `Los inversores entran y cobran en ARGt, con cuotapartes. Cuando un activo se paga, el valor de la cuotaparte sube por esa diferencia. La comisión es de ${pct(P.comisionAnualBps)} % anual sobre el patrimonio y se devenga día a día.`,
  "Si un activo no se paga, el fondo pierde lo que había pagado por él y el valor de la cuotaparte baja.",
];

export const seleccion: string[] = [
  "El gestor del fondo analiza cada activo: consulta la Central de Deudores del BCRA, el MAV (simulado en este prototipo), el balance si hay, la industria y la garantía.",
  "El puntaje, la tasa y el precio los calculan las reglas del sistema, no el gestor. El gestor recomienda y explica, pero no puede aprobar lo que las reglas rechazan.",
  "Si el activo cumple todas las reglas obligatorias, se compra sin intervención manual. Si alguna falla, no se compra y se explica el motivo.",
  "El contrato del fondo vuelve a verificar las reglas de cartera y de inversores antes de mover dinero.",
  "Con un mandato, el inversor suma sus propias reglas (presupuesto, banda mínima, tope por emisor, plazo, cobertura de garantía): el gestor solo compra lo que cumple las del fondo y las suyas.",
];

export const reglasObligatorias: ReglaObligatoria[] = [
  {
    id: "puntaje-minimo",
    titulo: `Puntaje mínimo de ${PUNTAJE_MINIMO} sobre 100`,
    descripcion: `Si el puntaje del emisor es menor a ${PUNTAJE_MINIMO} (banda C o D), el fondo no compra el activo, sin importar el resto de las condiciones.`,
    aplica: "Sistema",
  },
  {
    id: "impagos-confirmados",
    titulo: "Sin cheques rechazados impagos confirmados",
    descripcion:
      "Si el BCRA informa un cheque rechazado sin pagar del emisor, de cualquier antigüedad, el fondo no compra, aunque el puntaje sea alto. No cuentan los rechazos por defectos formales ni los ya regularizados.",
    aplica: "Sistema",
  },
  {
    id: "datos-no-verificables",
    titulo: "Datos del BCRA verificables",
    descripcion:
      "Si no se pueden verificar los antecedentes de cheques rechazados del emisor, o el BCRA informa cheques en revisión, no se aprueba automáticamente: sin esa verificación no se compra.",
    aplica: "Sistema",
  },
  {
    id: "plazo",
    titulo: `Plazo máximo de ${CONFIG_FONDO.plazoMaxDias} días`,
    descripcion: "Los días hasta el vencimiento son un límite de elegibilidad y no cambian el puntaje. Sí cambian el precio, porque el descuento se calcula por los días.",
    aplica: "Sistema",
  },
  {
    id: "monto",
    titulo: `Monto entre ${formatPesos(CONFIG_FONDO.nominalMin)} y ${formatPesos(CONFIG_FONDO.nominalMax)}`,
    descripcion: "Es un límite de elegibilidad: un activo fuera de ese rango no se compra. El monto no cambia el puntaje.",
    aplica: "Sistema",
  },
  {
    id: "emisor",
    titulo: `Máximo ${formatBps(P.maxEmisorBps)} del patrimonio por emisor`,
    descripcion: "Lo comprado a un mismo emisor no puede superar ese porcentaje del patrimonio del fondo. Es una regla de cartera, no un factor del puntaje.",
    aplica: "Contrato",
  },
  {
    id: "industria",
    titulo: `Máximo ${formatBps(P.maxIndustriaBps)} del patrimonio por industria`,
    descripcion: "Lo comprado a emisores de una misma industria no puede superar ese porcentaje del patrimonio. La industria es una estimación del gestor.",
    aplica: "Contrato",
  },
  {
    id: "liquidez",
    titulo: `Liquidez mínima de ${formatBps(P.liquidezMinBps)} del patrimonio`,
    descripcion: "Después de cada compra tiene que quedar en el fondo al menos ese porcentaje en ARGt líquido (representa una cuenta remunerada, simulada en este prototipo).",
    aplica: "Contrato",
  },
  {
    id: "kyc",
    titulo: "Inversores verificados (KYC)",
    descripcion: "Solo las direcciones habilitadas pueden suscribir, rescatar y recibir cuotapartes.",
    aplica: "Contrato",
  },
];

export const factoresScoring: FactorScoring[] = [
  {
    id: "situacion-bcra",
    factor: "Solvencia: situación en el BCRA",
    comoSeMide: `Se toma la peor situación entre las entidades con deuda material (al menos ${UMBRAL_MATERIALIDAD_PCT} % de la deuda total). Resta ${PENALIZACION_POR_NIVEL_SITUACION} puntos por cada nivel peor que 1. Las situaciones de deudas irrelevantes se muestran con 0 puntos.`,
    pesoMax: PENALIZACION_POR_NIVEL_SITUACION * (SITUACION_BCRA_MAX - 1),
    peso: `${puntos(PENALIZACION_POR_NIVEL_SITUACION)} por nivel, hasta ${puntos(PENALIZACION_POR_NIVEL_SITUACION * (SITUACION_BCRA_MAX - 1))}`,
    pendienteConfirmar: true,
  },
  {
    id: "juridico",
    factor: "Solvencia: proceso judicial o situación jurídica",
    comoSeMide: "Si el BCRA informa proceso judicial o situación jurídica (concurso, quiebra) en una entidad con deuda.",
    pesoMax: -PENALIZACION_JURIDICA,
    peso: puntos(-PENALIZACION_JURIDICA),
    pendienteConfirmar: true,
  },
  {
    id: "refinanciaciones",
    factor: "Solvencia: refinanciaciones",
    comoSeMide: "Si alguna entidad con deuda informa refinanciaciones.",
    pesoMax: PENALIZACION_REFINANCIACIONES,
    peso: puntos(PENALIZACION_REFINANCIACIONES),
  },
  {
    id: "deuda-creciente",
    factor: "Solvencia: deuda creciente",
    comoSeMide: `Si la deuda total creció más de ${MARGEN_DEUDA_CRECIENTE_PCT} % respecto de hace ${MESES_COMPARACION_DEUDA} meses.`,
    pesoMax: PENALIZACION_DEUDA_CRECIENTE,
    peso: puntos(PENALIZACION_DEUDA_CRECIENTE),
    pendienteConfirmar: true,
  },
  {
    id: "rechazados",
    factor: "Antecedentes de pago: cheques rechazados",
    comoSeMide: `Resta si hay cheques rechazados sin pagar en los últimos ${VENTANA_RECHAZOS_MESES} meses (sin contar defectos formales). Los antiguos, pagados o formales se muestran con 0 puntos. Un impago confirmado de cualquier antigüedad excluye al emisor (ver reglas obligatorias).`,
    pesoMax: PENALIZACION_RECHAZADOS_IMPAGOS,
    peso: puntos(PENALIZACION_RECHAZADOS_IMPAGOS),
  },
];

/** Suma de los máximos que se pueden restar. Puede superar 100: el puntaje se recorta en 0. */
export const totalDeduccionesMaximas: number = factoresScoring.reduce((s, f) => s + f.pesoMax, 0);

export const notaModeloPuntaje =
  "El puntaje no es un promedio ponderado: arranca en 100 y se le restan puntos por cada problema que informa el BCRA. El resultado se recorta entre 0 y 100. Monto, plazo, concentración y garantías no son factores del puntaje.";

export const bandas: { banda: Banda; desde: number; descripcion: string; secompra: boolean }[] = (["A", "B", "C", "D"] as Banda[]).map((banda) => {
  // El borde inferior de cada banda sale de bandaDe, no se escribe a mano.
  let desde = 100;
  while (desde > 0 && bandaDe(desde) !== banda) desde--;
  while (desde > 0 && bandaDe(desde - 1) === banda) desde--;
  return { banda, desde, descripcion: DESCRIPCION_BANDA[banda], secompra: desde >= PUNTAJE_MINIMO };
});

// ---- Garantías ---------------------------------------------------------------------------------------------------

const TIPOS_CON_PERFIL = Object.keys(PERFILES) as Exclude<TipoGarantia, "ninguna">[];

export const garantiasPorTipo: FilaGarantia[] = TIPOS_CON_PERFIL.map((tipo) => ({
  tipo,
  nombre: NOMBRE_GARANTIA[tipo],
  haircutBps: PERFILES[tipo].haircutBps,
  liquidez: PERFILES[tipo].liquidez,
}));

export const formulaCobertura = "Cobertura = valor declarado × (1 − descuento del tipo) ÷ valor nominal del activo";

export const garantiasExplicacion: string[] = [
  "La garantía respalda a un pagaré. El vendedor declara el tipo, la descripción y el valor; el valor es declarado y no se verifica. Cada tipo tiene un descuento (haircut) que baja ese valor, y la cobertura mide cuánto del valor nominal queda cubierto.",
  "Además de la cobertura, el análisis marca la liquidez del bien (qué tan fácil sería venderlo) y los documentos que faltan, como título, tasación independiente, seguro y libre de gravámenes. El instrumento legal de la prenda o hipoteca es siempre un paso posterior: este análisis no la constituye.",
];

/** Qué cambia hoy la garantía y qué no. Descripción exacta del flujo del fondo. */
export const garantiasEfectos: { cambia: boolean; texto: string }[] = [
  { cambia: false, texto: "No cambia el puntaje, la tasa ni el precio: se calculan solo con el historial del emisor en el BCRA." },
  { cambia: false, texto: "No decide si las reglas del fondo aprueban o rechazan el activo." },
  { cambia: true, texto: "Queda registrada en el contrato junto al activo: tipo de garantía, cobertura y el hash del análisis." },
  { cambia: true, texto: "En un mandato, si el inversor fija una cobertura mínima, un pagaré con menos cobertura (o sin garantía) se omite. Es una regla del mandato, no del fondo." },
  { cambia: true, texto: "El gestor la lee, la menciona en su informe y deja los documentos pendientes como condiciones. Es una opinión, no una regla: no puede aprobar lo que las reglas rechazan." },
];

// ---- Tasa --------------------------------------------------------------------------------------------------------

export const formulaTasa = `Tasa anual (TNA) = TAMAR (${formatBps(CONFIG_FONDO.tamarTnaBps)}) + ${String(SPREAD_POR_PUNTO_BPS / 100).replace(".", ",")} puntos porcentuales por cada punto que le falta al puntaje para 100, con un piso de ${formatBps(TASA_MIN_BPS)} y un tope de ${formatBps(TASA_MAX_BPS)}`;

export const PUNTAJES_EJEMPLO = [100, 95, 90, 85, 80, 75, PUNTAJE_MINIMO, PUNTAJE_MINIMO - 1] as const;

export const ejemplosTasa: FilaTasa[] = PUNTAJES_EJEMPLO.map((puntaje) => {
  const t = tasaPorPuntaje(puntaje, CONFIG_FONDO.tamarTnaBps);
  return {
    puntaje,
    banda: bandaDe(puntaje),
    nivelRiesgo: DESCRIPCION_BANDA[bandaDe(puntaje)],
    tasaTnaBps: puntaje >= PUNTAJE_MINIMO ? t.tasaBps : null,
    spreadBps: t.spreadBps,
    aplicado: t.aplicado,
  };
});

// ---- Objetivo ----------------------------------------------------------------------------------------------------

export const objetivo = {
  tnaBps: P.objetivoTnaBps,
  /** Lo que la cartera tiene que generar antes de la comisión para llegar al objetivo neto (decidido el 7-11-2026: el 40 % es neto). */
  brutoBps: P.objetivoTnaBps + P.comisionAnualBps,
  texto: `El objetivo del fondo es ${formatBps(P.objetivoTnaBps)} anual (TNA) neto para el inversor, después de la comisión. Para llegar, la cartera tiene que generar alrededor de ${formatBps(P.objetivoTnaBps + P.comisionAnualBps)} anual antes de la comisión. Es un número de referencia: el sistema no lo usa para decidir compras.`,
  aviso: "Es un objetivo, no está garantizado y puede no cumplirse. El valor de la cuotaparte puede subir o bajar, y la ganancia real depende de que los activos se paguen.",
  comision: `La comisión de ${formatBps(P.comisionAnualBps)} anual ya está descontada del objetivo neto. El valor de la cuotaparte la refleja día a día, porque se devenga emitiendo cuotapartes nuevas para el receptor de la comisión, lo que diluye a todos los inversores por igual.`,
} as const;

// ---- Cuotaparte --------------------------------------------------------------------------------------------------

export const cuotaparte: { titulo: string; texto: string }[] = [
  {
    titulo: "Cómo se calcula",
    texto: `El patrimonio es el ARGt líquido más los activos vigentes, tomados a lo que costó. Dividido por las cuotapartes, da el valor de cada una. El valor inicial es ${formatPesos(P.precioInicialCuotaparte)}.`,
  },
  { titulo: "Cuando el fondo compra un activo", texto: "El valor no cambia: el ARGt líquido baja y lo invertido sube por el mismo importe." },
  {
    titulo: "Cuando el activo se paga",
    texto: "Entra el valor nominal. Como se había comprado con descuento, el valor de la cuotaparte sube por la diferencia, de una sola vez y no día a día.",
  },
  {
    titulo: "Cuando el activo se rechaza (rebota)",
    texto: "No entra nada y lo invertido se da de baja: la pérdida queda registrada y el valor de la cuotaparte baja por el precio que había pagado el fondo.",
  },
  {
    titulo: "Comisión",
    texto: `${formatBps(P.comisionAnualBps)} anual sobre el patrimonio, devengada día a día. No sale plata del fondo: se emiten cuotapartes nuevas para el receptor de la comisión, así que el valor ya la descuenta.`,
  },
  {
    titulo: "Suscripción y rescate",
    texto: `La suscripción mínima es de ${formatDecimal(P.minCuotapartes)} cuotapartes enteras, de a una; los rescates no tienen mínimo. El rescate se solicita y lo liquida el gestor en ${P.rescateHorasHabiles} horas hábiles si lo pedís hasta las ${P.rescateCorteHora} hs (Buenos Aires); el valor se fija al liquidar, y si el fondo no tiene liquidez suficiente, espera.`,
  },
];
