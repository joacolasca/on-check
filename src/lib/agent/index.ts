// Bucle del gestor (PM). Garantías (D10/D17): asesora, no decide solo; los números salen de cotizar();
// nunca aprueba lo que las reglas rechazan; los límites duros (emisor, industria, liquidez) también los controla el servidor
// con la misma cuenta que el contrato, que sigue siendo el control final; si algo falla, cae al analista determinístico.
import type { Cotizacion, DecisionPM, InputCotizacion } from "@/shared/types";
import { parseUnits } from "viem";
import { primeraViolacion, proyectadaBps } from "@/lib/concentracion";
import { formatBps, unidadesADecimal, formatPesos } from "@/lib/format";
import { hashearCotizacion } from "@/lib/scoring/cotizar";
import { analistaDeterminista, concentracionProyectadaBps, industriaProyectadaBps, liquidezPosteriorBps } from "./analista-determinista";
import { esTextoSeguro, limpiarTexto } from "./honestidad";
import { herramientasPorDefecto } from "./herramientas";
import { POLITICA_FONDO } from "./politica";
import type { Analista, EstadoAgente, Herramientas, NombreHerramienta, PasoAgente, ResultadoAgente } from "./types";

const MOTIVO_NO_VERIFICADA = "No pudimos verificar los límites del fondo; no se aprueba automáticamente.";
const MOTIVO_FONDO_VACIO = "El fondo todavía no tiene patrimonio: con el fondo vacío el contrato no deja comprar activos.";

/**
 * Límites duros del fondo en el servidor (emisor, industria, liquidez mínima), con la misma cuenta que ChequeFund.fondearCheque
 * (src/lib/concentracion.ts). No dependen de que el analista haya mirado la cartera: si no la pidió, la lee el servidor. Si no se
 * puede leer (o falta algún dato necesario), no se aprueba. Devuelve el motivo de rechazo, o null si se puede comprar.
 * Solo se evalúa si las reglas de cotización ya aprobaron (si rechazaron, el rechazo ya está).
 */
async function controlarLimites(e: EstadoAgente, h: Herramientas): Promise<string | null> {
  const cot = e.cotizacion;
  if (!cot) return null;
  try {
    e.politica ??= await h.ver_politica_del_fondo().catch(() => POLITICA_FONDO);
    const pol = e.politica;
    e.cartera ??= await h.ver_cartera_actual();
    const c = e.cartera;
    if (c.liquidez === undefined || c.exposicionPorIndustria === undefined) return MOTIVO_NO_VERIFICADA;
    const patrimonio = parseUnits(c.totalAssets, 18);
    if (patrimonio <= 0n) return MOTIVO_FONDO_VACIO;
    const clave = Object.keys(c.exposicionPorLibrador).find((k) => k.toLowerCase() === cot.libradorHash.toLowerCase());
    const idIndustria = cot.industria?.id ?? e.industria?.id ?? 0;
    const precio = parseUnits(cot.precioCompra, 18);
    const exposicionEmisor = clave ? parseUnits(c.exposicionPorLibrador[clave], 18) : 0n;
    const exposicionIndustria = parseUnits(c.exposicionPorIndustria[String(idIndustria)] ?? "0", 18);
    const v = primeraViolacion({
      patrimonio,
      liquidez: parseUnits(c.liquidez, 18),
      exposicionEmisor,
      exposicionIndustria,
      precioCompra: precio,
      maxEmisorBps: BigInt(pol.maxEmisorBps),
      maxIndustriaBps: BigInt(pol.maxIndustriaBps),
      liquidezMinBps: BigInt(pol.liquidezMinBps),
    });
    if (!v) return null;
    const pesos = (wei: bigint) => formatPesos(unidadesADecimal(wei.toString()));
    switch (v.tipo) {
      case "emisor":
        return `El emisor quedaría en ${formatBps(proyectadaBps(exposicionEmisor, precio, patrimonio) ?? 0)} del fondo, por encima del tope de ${formatBps(pol.maxEmisorBps)}.`;
      case "industria":
        return `La industria "${e.industria?.nombre ?? cot.industria?.nombre ?? "Sin clasificar"}" quedaría en ${formatBps(proyectadaBps(exposicionIndustria, precio, patrimonio) ?? 0)} del fondo, por encima del tope de ${formatBps(pol.maxIndustriaBps)}.`;
      case "sin_liquidez":
        return `El fondo tiene ${pesos(v.disponible)} de liquidez y no alcanza para pagar ${pesos(v.precioCompra)}.`;
      case "liquidez_minima":
        return `Pagarlo dejaría la liquidez en ${formatBps(Number((v.liquidezPosterior * 10_000n) / patrimonio))} del fondo, por debajo del mínimo de ${formatBps(pol.liquidezMinBps)}.`;
    }
  } catch {
    return MOTIVO_NO_VERIFICADA;
  }
}

export type { ResultadoAgente, PasoAgente } from "./types";

export const MAX_PASOS = 28; // 8 herramientas con su interpretación, más margen para el razonamiento del modelo
const TIMEOUT_MS = 30_000;

export interface OpcionesAgente {
  /** Se llama apenas se produce cada paso (para mostrarlos en vivo). */
  onPaso?: (paso: PasoAgente) => void;
  /** Se llama si el analista con modelo falla y se empieza de cero con el determinístico: hay que descartar los pasos mostrados. */
  onReinicio?: () => void;
  analista?: Analista;
  herramientas?: Herramientas;
  /** Herramientas para la caída al determinístico (sin modelo). Por defecto, las mismas `herramientas` o las de siempre. */
  herramientasRespaldo?: Herramientas;
  maxPasos?: number;
  timeoutMs?: number;
}

function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("El agente tardó demasiado")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e: unknown) => { clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });
}

const TITULO_HERRAMIENTA: Record<NombreHerramienta, string> = {
  ver_politica_del_fondo: "Consulto la política del fondo",
  consultar_bcra: "Consulto la Central de Deudores del BCRA",
  ver_cartera_actual: "Reviso la cartera actual",
  consultar_mav: "Consulto el MAV (simulado)",
  analizar_balance: "Leo el balance cargado",
  clasificar_industria: "Estimo la industria del emisor",
  analizar_garantia: "Analizo la garantía ofrecida",
  emitir_cotizacion: "Calculo la cotización con el scoring propio",
};

const palabraActivo = (i: InputCotizacion): string => (i.tipo === "pagare" ? "pagaré" : "cheque");

/** Normaliza la decisión del PM: coherente con las condiciones y nunca por encima de lo que dicen las reglas. */
function decisionDelPM(a: { decision: DecisionPM["decision"]; condiciones: string[]; resumen: string }, reglasAprueban: boolean, alternativaResumen: string): DecisionPM {
  const resumen = limpiarTexto(a.resumen, alternativaResumen);
  if (!reglasAprueban || a.decision === "rechazar") return { decision: "rechazar", condiciones: [], resumen };
  const condiciones = a.condiciones.map((c) => c.trim()).filter((c) => c !== "" && esTextoSeguro(c));
  return { decision: condiciones.length ? "aprobar_con_condiciones" : "aprobar", condiciones, resumen };
}

async function correr(input: InputCotizacion, analista: Analista, h: Herramientas, maxPasos: number, onPaso?: (p: PasoAgente) => void): Promise<ResultadoAgente> {
  const e: EstadoAgente = { input, pasos: [] };
  const agregar = (p: Omit<PasoAgente, "n">) => {
    const paso = { ...p, n: e.pasos.length + 1 };
    e.pasos.push(paso);
    onPaso?.(paso);
  };

  const tiene = (herramienta: NombreHerramienta): boolean => {
    switch (herramienta) {
      case "ver_politica_del_fondo": return e.politica !== undefined;
      case "consultar_bcra": return e.scoring !== undefined;
      case "ver_cartera_actual": return e.cartera !== undefined;
      case "consultar_mav": return e.mav !== undefined;
      case "analizar_balance": return e.balance !== undefined;
      case "clasificar_industria": return e.industria !== undefined;
      case "analizar_garantia": return e.garantia !== undefined;
      case "emitir_cotizacion": return e.cotizacion !== undefined;
    }
  };

  /** Corre la herramienta (si todavía no corrió). Las que dependen de otras las piden antes, mostrando cada paso. */
  const ejecutar = async (herramienta: NombreHerramienta): Promise<void> => {
    if (tiene(herramienta)) return;
    const antes = async (...previas: NombreHerramienta[]) => {
      for (const p of previas) {
        if (tiene(p)) continue;
        await ejecutar(p);
        agregar({ tipo: "herramienta", herramienta: p, titulo: TITULO_HERRAMIENTA[p], detalle: "" });
      }
    };
    switch (herramienta) {
      case "ver_politica_del_fondo": e.politica = await h.ver_politica_del_fondo(); break;
      case "consultar_bcra": e.scoring = await h.consultar_bcra(input.cuit); break;
      case "ver_cartera_actual": e.cartera = await h.ver_cartera_actual(); break;
      case "consultar_mav": e.mav = await h.consultar_mav(input.cuit); break;
      case "analizar_balance": e.balance = await h.analizar_balance(input.balance); break;
      case "clasificar_industria": {
        await antes("consultar_bcra", "analizar_balance");
        if (!e.balance) throw new Error("clasificar_industria requiere analizar_balance antes");
        e.industria = await h.clasificar_industria({ cuit: input.cuit, denominacion: e.scoring?.denominacion ?? null, balance: e.balance });
        break;
      }
      case "analizar_garantia":
        e.garantia = input.garantia && input.garantia.tipo !== "ninguna" ? await h.analizar_garantia(input.garantia, input.nominal) : null;
        break;
      case "emitir_cotizacion": {
        await antes("consultar_bcra", "consultar_mav", "analizar_balance", "clasificar_industria", "analizar_garantia");
        if (!e.scoring) throw new Error("emitir_cotizacion requiere consultar_bcra antes");
        e.cotizacion = await h.emitir_cotizacion(input, e.scoring, {
          ...(e.industria ? { industria: e.industria } : {}),
          ...(e.garantia ? { garantia: e.garantia } : {}),
          ...(e.mav ? { mav: e.mav } : {}),
        });
        break;
      }
    }
  };

  for (let i = 0; i < maxPasos; i++) {
    const a = await analista.siguiente(e);
    if (a.tipo === "pensar") {
      agregar({ tipo: "pensamiento", titulo: a.titulo, detalle: a.detalle });
    } else if (a.tipo === "usar") {
      await ejecutar(a.herramienta);
      agregar({ tipo: "herramienta", herramienta: a.herramienta, titulo: TITULO_HERRAMIENTA[a.herramienta], detalle: "" });
    } else {
      const cot = e.cotizacion;
      if (!cot) throw new Error("El agente concluyó sin emitir la cotización");
      // Las reglas deciden, no el agente: si las reglas aprueban, la cotización sigue aprobada aunque el gestor recomiende no comprar
      // (su recomendación va como aviso y en decisionPM). Y si las reglas rechazan, el gestor no puede aprobar. Los límites duros del fondo
      // (emisor, industria, liquidez) también los controla el servidor: si se rompen, o no se pueden verificar, se rechaza. Y los hace cumplir el contrato.
      const motivoLimites = cot.aprobada ? await controlarLimites(e, h) : null;
      const reglasAprueban = cot.aprobada && motivoLimites === null;
      const alternativa = reglasAprueban ? cot.explicacion : (motivoLimites ?? cot.motivoRechazo ?? cot.explicacion);
      // Si rechazó el servidor por los límites, el resumen es el motivo (no lo que el gestor haya escrito pensando en aprobar).
      const decisionPM: DecisionPM = motivoLimites !== null ? { decision: "rechazar", condiciones: [], resumen: motivoLimites } : decisionDelPM(a, reglasAprueban, alternativa);
      const final: Cotizacion = reglasAprueban
        ? { ...cot, decisionPM }
        : { ...cot, aprobada: false, motivoRechazo: motivoLimites ?? cot.motivoRechazo ?? a.motivo ?? "No cumple las reglas del fondo.", decisionPM };
      // El hash tiene que ser siempre el del contenido final (incluye la decisión del PM).
      const { cotizacionHash: _anterior, ...sinHash } = final;
      void _anterior;
      final.cotizacionHash = hashearCotizacion(sinHash);

      const activo = palabraActivo(input);
      const alertas: string[] = [];
      if (reglasAprueban && decisionPM.decision === "rechazar") {
        const razon = limpiarTexto(a.motivo ?? a.resumen, "el análisis encontró un riesgo");
        alertas.push(`El agente recomienda no comprar este ${activo}: ${razon} Igual cumple las reglas del fondo y el contrato decide.`);
      }
      if (motivoLimites !== null) alertas.push(`No se aprueba este ${activo}: ${motivoLimites}`);

      const condiciones = decisionPM.condiciones.length ? ` Condiciones: ${decisionPM.condiciones.join("; ")}.` : "";
      agregar({
        tipo: "conclusion",
        titulo: !reglasAprueban
          ? `Propongo no comprar el ${activo}`
          : decisionPM.decision === "aprobar"
            ? `Propongo aprobar el ${activo}`
            : decisionPM.decision === "aprobar_con_condiciones"
              ? `Propongo aprobar el ${activo} con condiciones`
              : `Recomiendo no comprar el ${activo}, aunque cumple las reglas`,
        detalle: !reglasAprueban ? (final.motivoRechazo ?? "") : `${decisionPM.resumen}${condiciones}`,
      });
      // Lo que el gestor proyectó con la cartera (para el informe del activo): son los mismos números que usan los límites del servidor.
      const politica = e.politica ?? POLITICA_FONDO;
      const emisorBps = concentracionProyectadaBps(e);
      const industriaBps = industriaProyectadaBps(e);
      const liquidezBps = liquidezPosteriorBps(e);
      return { cotizacion: final, pasos: e.pasos, alertas, modo: analista.modo, proyecciones: { emisorBps, industriaBps, liquidezPosteriorBps: liquidezBps, politica } };
    }
  }
  throw new Error("El agente superó el máximo de pasos");
}

/** Analiza un cheque o pagaré. Nunca lanza por fallas del analista: cae al determinístico. */
export async function analizarCheque(input: InputCotizacion, op: OpcionesAgente = {}): Promise<ResultadoAgente> {
  const h = op.herramientas ?? herramientasPorDefecto();
  const maxPasos = op.maxPasos ?? MAX_PASOS;
  const analista = op.analista ?? analistaDeterminista;
  try {
    return await conTimeout(correr(input, analista, h, maxPasos, op.onPaso), op.timeoutMs ?? TIMEOUT_MS);
  } catch (err) {
    if (analista === analistaDeterminista) throw err; // sin red de seguridad por debajo
    op.onReinicio?.();
    // La caída es sin modelo: si las herramientas traían uno (industria, garantía), se usan las de siempre.
    const respaldo = op.herramientasRespaldo ?? (op.herramientas ? h : herramientasPorDefecto());
    return correr(input, analistaDeterminista, respaldo, MAX_PASOS, op.onPaso);
  }
}
