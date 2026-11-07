// Analista determinístico: mismo recorrido que haría el gestor con modelo, sin modelo. Es la red de seguridad (D17).
import { DESCRIPCION_BANDA, formatBps, formatPesos, sumarDecimales } from "@/lib/format";
import { proporcionBps } from "@/lib/panel";
import { aCentavos } from "@/lib/scoring/dinero";
import { REGLAS_DE_COTIZACION } from "./politica";
import type { Accion, Analista, EstadoAgente, NombreHerramienta } from "./types";

/** Concentración del librador si se compra este cheque, en basis points. */
export function concentracionProyectadaBps(estado: EstadoAgente): number | null {
  const { cotizacion, cartera } = estado;
  if (!cotizacion || !cartera) return null;
  const actual = cartera.exposicionPorLibrador[cotizacion.libradorHash] ?? "0";
  return proporcionBps(sumarDecimales(actual, cotizacion.precioCompra), cartera.totalAssets);
}

/** Exposición de la industria si se compra este cheque. null si la cartera no informa industrias (la capa chain las llena después). */
export function industriaProyectadaBps(estado: EstadoAgente): number | null {
  const { cotizacion, cartera } = estado;
  if (!cotizacion || !cartera?.exposicionPorIndustria) return null;
  const actual = cartera.exposicionPorIndustria[String(estado.industria?.id ?? 0)] ?? "0";
  return proporcionBps(sumarDecimales(actual, cotizacion.precioCompra), cartera.totalAssets);
}

/** Liquidez que quedaría después de pagar el cheque, en bps del patrimonio. null si la cartera no informa liquidez. Puede ser negativa. */
export function liquidezPosteriorBps(estado: EstadoAgente): number | null {
  const { cotizacion, cartera } = estado;
  if (!cotizacion || !cartera?.liquidez) return null;
  const total = aCentavos(cartera.totalAssets);
  if (total === 0n) return null;
  return Number(((aCentavos(cartera.liquidez) - aCentavos(cotizacion.precioCompra)) * 10_000n) / total);
}

function interpretar(h: NombreHerramienta, e: EstadoAgente): { titulo: string; detalle: string } {
  if (h === "ver_politica_del_fondo" && e.politica) {
    const p = e.politica;
    return {
      titulo: "Repaso la política del fondo",
      detalle: `Máximo ${formatBps(p.maxEmisorBps)} del patrimonio por emisor y ${formatBps(p.maxIndustriaBps)} por industria, con una liquidez mínima de ${formatBps(p.liquidezMinBps)}. El ${formatBps(p.objetivoTnaBps)} TNA es un objetivo, no una promesa. Al cotizar se aplica: ${REGLAS_DE_COTIZACION}.`,
    };
  }
  if (h === "consultar_bcra" && e.scoring) {
    const s = e.scoring;
    const ajustes = s.ajustes.length
      ? ` Ajustes: ${s.ajustes.map((a) => `${a.puntos > 0 ? "+" : a.puntos < 0 ? "−" : ""}${Math.abs(a.puntos)} ${a.motivo}`).join("; ")}.`
      : " Sin ajustes: no encontré atrasos ni rechazos.";
    return {
      titulo: `El emisor queda en banda ${s.banda}`,
      detalle: `Puntaje ${s.puntaje}/100 (${DESCRIPCION_BANDA[s.banda].toLowerCase()}), peor situación ${s.situacionPeor}.${ajustes}`,
    };
  }
  if (h === "ver_cartera_actual" && e.cartera) {
    const industrias = e.cartera.exposicionPorIndustria ? " y por industria" : "";
    const liquidez = e.cartera.liquidez ? ` Hay ${formatPesos(e.cartera.liquidez)} en liquidez.` : "";
    return {
      titulo: "Miro cómo está la cartera",
      detalle: `El fondo tiene ${formatPesos(e.cartera.totalAssets)} en total.${liquidez} Voy a comparar este activo contra lo que ya hay por emisor${industrias}.`,
    };
  }
  if (h === "consultar_mav" && e.mav) {
    const m = e.mav;
    const datos =
      m.operaciones === 0
        ? "sin operaciones registradas para este emisor"
        : `${m.operaciones} operaciones, tasa promedio ${m.tasaPromedioTnaBps === null ? "sin dato" : `${formatBps(m.tasaPromedioTnaBps)} TNA`}, plazo promedio ${m.plazoPromedioDias ?? "sin dato"} días, última operación ${m.ultimaOperacion ?? "sin dato"}`;
    return { titulo: "Miro el historial del emisor en el MAV (simulado)", detalle: `${m.fuente}: ${datos}. ${m.nota}` };
  }
  if (h === "analizar_balance" && e.balance) {
    return { titulo: e.balance.disponible ? "Reviso el balance cargado" : "No hay balance cargado", detalle: e.balance.resumen };
  }
  if (h === "clasificar_industria" && e.industria) {
    const i = e.industria;
    return {
      titulo: `Estimo la industria: ${i.nombre}`,
      detalle: `${i.fundamento} Fuentes: ${i.fuentes.length ? i.fuentes.join(", ") : "ninguna"}. Confianza ${i.confianza}. Es una estimación del agente, no una clasificación oficial.`,
    };
  }
  if (h === "analizar_garantia") {
    const g = e.garantia;
    if (!g) return { titulo: "Sin garantía cargada", detalle: "El vendedor no ofreció una garantía: sigo el análisis solo con el emisor." };
    return {
      titulo: `Analizo la garantía (${g.tipo})`,
      detalle: `Cobertura ${formatBps(g.coberturaBps)} del nominal, liquidez ${g.liquidez}. ${g.observaciones} Faltan: ${g.documentosPendientes.join("; ")}.`,
    };
  }
  if (h === "emitir_cotizacion" && e.cotizacion) {
    const c = e.cotizacion;
    const bps = concentracionProyectadaBps(e);
    const conc = bps === null ? "" : ` Con este activo el emisor llegaría a ${formatBps(bps)} del fondo.`;
    return {
      titulo: c.aprobada ? "La cotización cumple las reglas" : "La cotización no cumple las reglas",
      detalle: c.aprobada
        ? `Tasa ${formatBps(c.tasaTnaBps)} a ${c.dias} días: adelanto de ${formatPesos(c.precioCompra)}.${conc}`
        : (c.motivoRechazo ?? "No cumple las reglas del fondo."),
    };
  }
  return { titulo: "Sigo con el análisis", detalle: "" };
}

/** Resumen del gestor armado solo con lo que devolvieron las herramientas. */
function resumenDe(e: EstadoAgente): string {
  const partes: string[] = [];
  if (e.scoring) partes.push(`El emisor figura en banda ${e.scoring.banda} del BCRA, con puntaje ${e.scoring.puntaje}/100.`);
  partes.push(e.balance?.disponible ? e.balance.resumen : "Sin balance cargado: el análisis se apoya solo en el BCRA.");
  if (e.industria) partes.push(`Industria estimada por el agente: ${e.industria.nombre} (confianza ${e.industria.confianza}).`);
  if (e.mav) {
    partes.push(
      e.mav.operaciones === 0
        ? "MAV (simulado): sin operaciones registradas del emisor."
        : `MAV (simulado): ${e.mav.operaciones} operaciones del emisor, dato de demostración.`,
    );
  }
  if (e.garantia) {
    partes.push(`Garantía: cubre ${formatBps(e.garantia.coberturaBps)} del nominal con un descuento supuesto de ${formatBps(e.garantia.haircutBps)}; la prenda legal es un paso posterior.`);
  }
  return partes.join(" ");
}

export const analistaDeterminista: Analista = {
  modo: "determinista",
  async siguiente(e: EstadoAgente): Promise<Accion> {
    const ultimo = e.pasos[e.pasos.length - 1];
    if (ultimo?.tipo === "herramienta" && ultimo.herramienta) {
      return { tipo: "pensar", ...interpretar(ultimo.herramienta, e) };
    }
    if (!e.politica) return { tipo: "usar", herramienta: "ver_politica_del_fondo" };
    if (!e.scoring) return { tipo: "usar", herramienta: "consultar_bcra" };
    if (!e.cartera) return { tipo: "usar", herramienta: "ver_cartera_actual" };
    if (!e.mav) return { tipo: "usar", herramienta: "consultar_mav" };
    if (!e.balance) return { tipo: "usar", herramienta: "analizar_balance" };
    if (!e.industria) return { tipo: "usar", herramienta: "clasificar_industria" };
    if (e.garantia === undefined) return { tipo: "usar", herramienta: "analizar_garantia" };
    if (!e.cotizacion) return { tipo: "usar", herramienta: "emitir_cotizacion" };
    const c = e.cotizacion;
    if (!c.aprobada) {
      return { tipo: "concluir", decision: "rechazar", motivo: c.motivoRechazo, condiciones: [], resumen: c.motivoRechazo ?? "No cumple las reglas del fondo." };
    }
    // Con garantía, lo que falta para instrumentar la prenda son condiciones de la aprobación.
    const condiciones = e.garantia ? e.garantia.documentosPendientes.map((d) => `Reunir y verificar: ${d}`) : [];
    return {
      tipo: "concluir",
      decision: condiciones.length ? "aprobar_con_condiciones" : "aprobar",
      motivo: null,
      condiciones,
      resumen: resumenDe(e),
    };
  },
};
