// Análisis de garantías (determinístico). Es un ANÁLISIS: la prenda o hipoteca legal es un paso posterior y acá se listan los
// documentos que faltan. Los descuentos por tipo son supuestos del fondo, a validar.
import { keccak256, toBytes } from "viem";
import { formatBps, formatPesos } from "@/lib/format";
import { aCentavos, deCentavos, mulDiv } from "@/lib/scoring/dinero";
import { canonico } from "@/lib/scoring/cotizar";
import type { GarantiaAnalisis, GarantiaInput, TipoGarantia } from "@/shared/types";

type Liquidez = GarantiaAnalisis["liquidez"];

interface Documento {
  texto: string;
  /** Palabras (sin tildes, en minúsculas) que, si aparecen en un documento adjuntado, indican que ya está. */
  claves: string[];
}

export interface PerfilGarantia {
  haircutBps: number;
  liquidez: Liquidez;
  riesgos: string[];
  documentos: Documento[];
}

const TASACION: Documento = { texto: "Tasación independiente", claves: ["tasacion"] };
const SEGURO: Documento = { texto: "Póliza de seguro vigente a favor del fondo", claves: ["seguro", "poliza"] };
const LIBRE_GRAVAMEN: Documento = { texto: "Certificado de libre de gravámenes e inhibiciones", claves: ["gravamen", "inhibicion", "libre de deuda"] };

// Los descuentos (haircut) por tipo los confirmó Facu el 7-11-2026. La liquidez y los documentos por tipo son criterio del equipo.
export const PERFILES: Record<Exclude<TipoGarantia, "ninguna">, PerfilGarantia> = {
  vehiculo: {
    haircutBps: 3000,
    liquidez: "alta",
    riesgos: ["Se deprecia con el tiempo y el uso", "Puede sufrir siniestro, robo o deterioro mientras dure la deuda", "Sin la prenda inscripta no es oponible a terceros"],
    documentos: [
      { texto: "Título del automotor e informe de dominio", claves: ["titulo", "dominio"] },
      TASACION,
      SEGURO,
      LIBRE_GRAVAMEN,
    ],
  },
  inmueble: {
    haircutBps: 2500,
    liquidez: "media",
    riesgos: ["La venta de un inmueble lleva tiempo y gastos de ejecución", "El valor depende del mercado inmobiliario y de la ubicación", "Puede tener hipotecas, embargos o inhibiciones previas"],
    documentos: [
      { texto: "Título de propiedad e informe de dominio", claves: ["titulo", "dominio", "escritura"] },
      TASACION,
      SEGURO,
      LIBRE_GRAVAMEN,
    ],
  },
  terreno: {
    haircutBps: 3500,
    liquidez: "media",
    riesgos: ["Valor sensible a la zona y a la zonificación", "Venta lenta y sin renta que cubra costos mientras se ejecuta", "Puede tener gravámenes o restricciones al dominio"],
    documentos: [
      { texto: "Título de propiedad e informe de dominio", claves: ["titulo", "dominio", "escritura"] },
      TASACION,
      { texto: "Plano de mensura y estado de impuestos y tasas", claves: ["plano", "mensura", "impuesto"] },
      LIBRE_GRAVAMEN,
    ],
  },
  embarcacion: {
    haircutBps: 4000,
    liquidez: "baja",
    riesgos: ["Mercado de reventa chico y de venta lenta", "Se deprecia y exige mantenimiento y guarda", "Riesgo de siniestro o de que se mueva fuera de la jurisdicción"],
    documentos: [
      { texto: "Título de propiedad y matrícula de la embarcación", claves: ["titulo", "matricula"] },
      TASACION,
      SEGURO,
      LIBRE_GRAVAMEN,
    ],
  },
  energia: {
    haircutBps: 4500,
    liquidez: "baja",
    riesgos: ["Activo muy específico: pocos compradores posibles", "Depende de la concesión, del contrato de venta de energía y de su mantenimiento", "Puede ser difícil de desmontar o trasladar para venderlo"],
    documentos: [
      { texto: "Factura o título de propiedad del equipo", claves: ["factura", "titulo"] },
      TASACION,
      SEGURO,
      { texto: "Contrato de venta de energía o autorización vigente", claves: ["contrato", "autorizacion", "concesion"] },
      LIBRE_GRAVAMEN,
    ],
  },
  petroleo: {
    haircutBps: 5500,
    liquidez: "baja",
    riesgos: ["El valor depende de las reservas y del precio del petróleo", "Requiere concesión vigente y cumplimiento ambiental", "Activo difícil de vender o de ejecutar por separado"],
    documentos: [
      { texto: "Título de la concesión o derecho sobre el pozo", claves: ["concesion", "titulo"] },
      { texto: "Certificación de reservas y tasación independiente", claves: ["reserva", "tasacion"] },
      SEGURO,
      { texto: "Constancia de cumplimiento ambiental", claves: ["ambiental"] },
      LIBRE_GRAVAMEN,
    ],
  },
  fabrica: {
    haircutBps: 4500,
    liquidez: "baja",
    riesgos: ["Valor atado a que la planta siga operando", "Maquinaria específica y de venta lenta", "Puede tener gravámenes, deudas laborales o fiscales previas"],
    documentos: [
      { texto: "Título del inmueble y del equipamiento, e informe de dominio", claves: ["titulo", "dominio"] },
      TASACION,
      SEGURO,
      { texto: "Inventario de maquinaria", claves: ["inventario"] },
      LIBRE_GRAVAMEN,
    ],
  },
  comercio: {
    haircutBps: 5000,
    liquidez: "baja",
    riesgos: ["El valor depende de la marca, la clientela y la ubicación, que no se pueden ejecutar fácil", "Fondo de comercio de venta lenta", "Puede tener deudas comerciales, laborales o fiscales previas"],
    documentos: [
      { texto: "Contrato de locación o título del local", claves: ["locacion", "alquiler", "titulo"] },
      TASACION,
      SEGURO,
      { texto: "Inventario de bienes y habilitaciones vigentes", claves: ["inventario", "habilitacion"] },
      LIBRE_GRAVAMEN,
    ],
  },
  otra: {
    haircutBps: 6000,
    liquidez: "baja",
    riesgos: ["Activo no previsto en la política: su valor y su venta son difíciles de estimar", "No hay criterio de descuento propio: se aplica el más conservador"],
    documentos: [
      { texto: "Documentación que acredite la propiedad del bien", claves: ["titulo", "propiedad", "factura"] },
      TASACION,
      SEGURO,
      LIBRE_GRAVAMEN,
    ],
  },
};

/** Siempre pendiente: la prenda legal es un paso posterior al análisis. */
export const DOCUMENTO_PRENDA = "Instrumento legal de la prenda o hipoteca (paso posterior)";

const normalizar = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** keccak256 del JSON canónico del análisis sin su propio hash. */
export function hashearGarantia(sinHash: Omit<GarantiaAnalisis, "garantiaHash">): string {
  return keccak256(toBytes(canonico(sinHash)));
}

export function analizarGarantiaBase(input: GarantiaInput, nominal: string): GarantiaAnalisis {
  const valorC = aCentavos(input.valorDeclarado);
  const nominalC = aCentavos(nominal);

  if (input.tipo === "ninguna") {
    const sinHash: Omit<GarantiaAnalisis, "garantiaHash"> = {
      tipo: "ninguna",
      descripcion: input.descripcion,
      valorDeclarado: input.valorDeclarado,
      haircutBps: 10_000,
      valorAjustado: "0",
      coberturaBps: 0,
      liquidez: "baja",
      riesgos: ["No hay garantía: la deuda depende solo del emisor"],
      documentosPendientes: [],
      observaciones: "No se ofrece garantía. El análisis crediticio se apoya solo en el emisor.",
      analizadoPor: "determinista",
    };
    return { ...sinHash, garantiaHash: hashearGarantia(sinHash) };
  }

  const perfil = PERFILES[input.tipo];
  const ajustadoC = mulDiv(valorC, BigInt(10_000 - perfil.haircutBps), 10_000n);
  const coberturaBps = nominalC === 0n ? 0 : Number((ajustadoC * 10_000n) / nominalC);
  const adjuntos = (input.documentos ?? []).map(normalizar);
  const pendientes = perfil.documentos.filter((d) => !adjuntos.some((a) => d.claves.some((c) => a.includes(c)))).map((d) => d.texto);
  const recibidos = input.documentos?.filter((d) => d.trim()) ?? [];

  const valorAjustado = deCentavos(ajustadoC);
  const observaciones =
    `Valor declarado por el vendedor: ${formatPesos(input.valorDeclarado)} (sin verificar). Con un descuento supuesto de ${formatBps(perfil.haircutBps)} queda en ${formatPesos(valorAjustado)}, ` +
    `que cubre ${formatBps(coberturaBps)} del valor nominal. ` +
    (recibidos.length ? `El vendedor mencionó ${recibidos.length} documento${recibidos.length === 1 ? "" : "s"}, que todavía hay que revisar. ` : "El vendedor no adjuntó documentos. ") +
    "Esto es un análisis: la prenda o hipoteca legal es un paso posterior.";

  const sinHash: Omit<GarantiaAnalisis, "garantiaHash"> = {
    tipo: input.tipo,
    descripcion: input.descripcion,
    valorDeclarado: input.valorDeclarado,
    haircutBps: perfil.haircutBps,
    valorAjustado,
    coberturaBps,
    liquidez: perfil.liquidez,
    riesgos: [...perfil.riesgos],
    documentosPendientes: [...pendientes, DOCUMENTO_PRENDA],
    observaciones,
    analizadoPor: "determinista",
  };
  return { ...sinHash, garantiaHash: hashearGarantia(sinHash) };
}

export interface EnriquecimientoGarantia {
  riesgos: string[];
  observaciones: string;
}

/** Suma los riesgos y la observación que aportó el gestor al análisis base y recalcula el hash. Los números no se tocan. */
export function enriquecerGarantia(base: GarantiaAnalisis, extra: EnriquecimientoGarantia): GarantiaAnalisis {
  const riesgos = [...base.riesgos];
  for (const r of extra.riesgos) if (!riesgos.includes(r)) riesgos.push(r);
  const observaciones = extra.observaciones ? `${base.observaciones} ${extra.observaciones}` : base.observaciones;
  const { garantiaHash: _anterior, ...resto } = base;
  void _anterior;
  const sinHash: Omit<GarantiaAnalisis, "garantiaHash"> = { ...resto, riesgos, observaciones, analizadoPor: "agente" };
  return { ...sinHash, garantiaHash: hashearGarantia(sinHash) };
}
