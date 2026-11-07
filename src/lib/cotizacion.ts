// Etiquetas de presentación de la cotización v2 (decisión del gestor, garantía, industria). Sin React.
import type { DecisionPM, GarantiaAnalisis, IndustriaEstimada, TipoActivo, TipoGarantia } from "@/shared/types";

export const NOMBRE_TIPO: Record<TipoActivo, string> = { cheque: "Cheque", pagare: "Pagaré" };
/** Quien paga: en el cheque es el librador; en el pagaré, el suscriptor. */
export const NOMBRE_EMISOR: Record<TipoActivo, string> = { cheque: "librador", pagare: "suscriptor" };

export const NOMBRE_GARANTIA: Record<TipoGarantia, string> = {
  ninguna: "Sin garantía",
  vehiculo: "Vehículo",
  inmueble: "Inmueble",
  terreno: "Terreno",
  embarcacion: "Embarcación",
  energia: "Equipo de energía (turbina)",
  petroleo: "Pozo petrolero",
  fabrica: "Fábrica",
  comercio: "Comercio o gimnasio",
  otra: "Otra garantía",
};

export const DESCRIPCION_DECISION: Record<DecisionPM["decision"], { titulo: string; clases: string }> = {
  aprobar: { titulo: "El gestor aprueba la compra", clases: "bg-estado-pagado-bg text-estado-pagado-tx" },
  aprobar_con_condiciones: { titulo: "El gestor aprueba con condiciones", clases: "bg-estado-pendiente-bg text-estado-pendiente-tx" },
  rechazar: { titulo: "El gestor no compra este activo", clases: "bg-estado-rechazado-bg text-estado-rechazado-tx" },
};

export const ETIQUETA_CONFIANZA: Record<IndustriaEstimada["confianza"], string> = { alta: "Confianza alta", media: "Confianza media", baja: "Confianza baja" };
export const ETIQUETA_LIQUIDEZ_GARANTIA: Record<GarantiaAnalisis["liquidez"], string> = { alta: "Liquidez alta", media: "Liquidez media", baja: "Liquidez baja" };

/** Aviso fijo del análisis de garantía: el análisis no es la prenda. */
export const AVISO_PRENDA = "La prenda legal se firma después: este análisis no la reemplaza.";

/** "MAV (simulado)" siempre rotulado: en la demo no hay integración real. */
export const ROTULO_MAV = "MAV (simulado)";
