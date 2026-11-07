// Lógica de presentación de /mandato: formulario, orquestador de la corrida (máquina de estados) e informe. Sin React.
import type {
  ActivoBandeja,
  Banda,
  CompraMandato,
  Cotizacion,
  EstadoMandato,
  EvaluacionMandato,
  Mandato,
  RazonMandato,
  ReboteMandato,
  ReglaMandato,
  ResumenFondo,
  TipoActivo,
} from "@/shared/types";
import type { PasoAgente } from "./agent/types";
import { esErrorDeAcceso, mensajeDeError, type ErrorUi } from "./api-client";
import { formatBps, formatPesos, urlTx } from "./format";
import type { ClienteMandato } from "./mandato-client";
import { cuitValido, normalizarCuit, normalizarMonto } from "./pyme";

// ================================================================ Formulario del mandato

export const PRESUPUESTO_MAX = 100_000_000n;

export interface ValoresMandato {
  presupuesto: string;
  bandaMinima: Banda;
  topePct: string; // % del presupuesto por emisor
  plazoMaxDias: string;
  tipos: TipoActivo[];
  exigeCobertura: boolean;
  coberturaPct: string;
  pideAprobacion: boolean;
  aprobacionSobre: string;
}

export type ErroresMandato = Partial<Record<"presupuesto" | "tope" | "plazo" | "tipos" | "cobertura" | "aprobacion", string>>;

/** "15" → 1500, "12,5" → 1250. null si no es un porcentaje con hasta 2 decimales. Sin `number`. */
export function porcentajeABps(texto: string): number | null {
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(texto.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

const bpsAPorcentaje = (bps: number): string => formatBps(bps).replace(" %", "");

export function valoresDesdeMandato(m: Mandato): ValoresMandato {
  return {
    presupuesto: m.presupuesto,
    bandaMinima: m.bandaMinima,
    topePct: bpsAPorcentaje(m.topeEmisorBps),
    plazoMaxDias: String(m.plazoMaxDias),
    tipos: [...m.tipos],
    exigeCobertura: m.coberturaMinBps !== null,
    coberturaPct: m.coberturaMinBps !== null ? bpsAPorcentaje(m.coberturaMinBps) : "100",
    pideAprobacion: m.aprobacionSobre !== null,
    aprobacionSobre: m.aprobacionSobre ?? "",
  };
}

/** Mismas validaciones que `POST /api/mandato/iniciar` (el servidor vuelve a validar). */
export function mandatoDesdeValores(v: ValoresMandato): { ok: true; mandato: Mandato } | { ok: false; errores: ErroresMandato } {
  const e: ErroresMandato = {};
  const presupuesto = normalizarMonto(v.presupuesto);
  if (presupuesto === "" || BigInt(presupuesto) <= 0n) e.presupuesto = "Poné un presupuesto mayor a cero.";
  else if (BigInt(presupuesto) > PRESUPUESTO_MAX) e.presupuesto = `El máximo es ${formatPesos(PRESUPUESTO_MAX.toString())}.`;

  const tope = porcentajeABps(v.topePct);
  if (tope === null || tope < 100 || tope > 10000) e.tope = "El tope por emisor va del 1 % al 100 %.";

  const plazo = /^\d+$/.test(v.plazoMaxDias.trim()) ? Number(v.plazoMaxDias) : NaN;
  if (!Number.isInteger(plazo) || plazo < 1 || plazo > 90) e.plazo = "El plazo máximo va de 1 a 90 días.";

  if (v.tipos.length === 0) e.tipos = "Elegí al menos un instrumento.";

  let cobertura: number | null = null;
  if (v.exigeCobertura) {
    cobertura = porcentajeABps(v.coberturaPct);
    if (cobertura === null || cobertura > 30000) e.cobertura = "La cobertura mínima va del 0 % al 300 %.";
  }

  let aprobacion: string | null = null;
  if (v.pideAprobacion) {
    aprobacion = normalizarMonto(v.aprobacionSobre);
    if (aprobacion === "" || BigInt(aprobacion) <= 0n) e.aprobacion = "Poné un monto mayor a cero.";
  }

  if (Object.keys(e).length > 0) return { ok: false, errores: e };
  return {
    ok: true,
    mandato: {
      presupuesto,
      bandaMinima: v.bandaMinima,
      topeEmisorBps: tope as number,
      plazoMaxDias: plazo,
      tipos: v.tipos,
      coberturaMinBps: cobertura,
      aprobacionSobre: aprobacion,
    },
  };
}

/** Explicación corta de cada regla del formulario. */
export const EXPLICACION_REGLAS = {
  presupuesto: "Lo máximo que el agente puede invertir en esta corrida. Nunca compra por encima.",
  banda: "Compra solo activos de esa banda de riesgo o mejor (A es la mejor).",
  tope: "Cuánto del presupuesto puede ir a un mismo emisor. El fondo tiene su propio tope, más estricto, y lo hace cumplir el contrato.",
  plazo: "No compra activos que venzan más allá de estos días.",
  tipos: "Qué instrumentos acepta comprar.",
  cobertura: "Si hay garantía, el valor declarado debe cubrir al menos este porcentaje del nominal. Un pagaré sin garantía no cumple.",
  aprobacion: "Por encima de este nominal el agente te pide aprobación antes de comprar.",
} as const;

// ================================================================ Razones y resultados

export const TITULO_REGLA: Record<ReglaMandato, string> = {
  revocado: "Mandato vigente",
  tipo: "Instrumento",
  plazo: "Plazo",
  cotizacion: "Cotización del fondo",
  banda: "Banda de riesgo",
  gestor: "Decisión del gestor",
  cobertura: "Cobertura de garantía",
  emisor_bloqueado: "Emisor no bloqueado",
  tope_emisor: "Tope por emisor",
  presupuesto: "Presupuesto disponible",
  aprobacion: "Aprobación",
};

export const tituloRegla = (r: ReglaMandato): string => TITULO_REGLA[r] ?? r;

export function resumenRazones(razones: RazonMandato[]): { cumplen: number; total: number; fallan: RazonMandato[] } {
  const fallan = razones.filter((r) => !r.cumple);
  return { cumplen: razones.length - fallan.length, total: razones.length, fallan };
}

export type ResultadoItem = "compro" | "omitio" | "contrato_no" | "esperando_aprobacion" | "omitido_por_vos" | "error" | "cancelado";
export type TonoResultado = "ok" | "neutro" | "alerta" | "error";

export const ETIQUETA_RESULTADO: Record<ResultadoItem, { texto: string; tono: TonoResultado }> = {
  compro: { texto: "Compró", tono: "ok" },
  omitio: { texto: "Omitió", tono: "neutro" },
  contrato_no: { texto: "El contrato dijo que no", tono: "error" },
  esperando_aprobacion: { texto: "Esperando tu aprobación", tono: "alerta" },
  omitido_por_vos: { texto: "Lo omitiste vos", tono: "neutro" },
  error: { texto: "No se pudo procesar", tono: "error" },
  cancelado: { texto: "Cancelado por la revocación", tono: "neutro" },
};

// ================================================================ CUIT sorpresa

export interface ValoresSorpresa {
  cuit: string;
  nominal: string;
  dias: string;
  tipo: TipoActivo;
}
export type ErroresSorpresa = Partial<Record<"cuit" | "nominal" | "dias", string>>;

export function activoSorpresa(v: ValoresSorpresa, n: number): { ok: true; activo: ActivoBandeja } | { ok: false; errores: ErroresSorpresa } {
  const e: ErroresSorpresa = {};
  const cuit = normalizarCuit(v.cuit);
  if (!cuitValido(cuit)) e.cuit = "Revisá el CUIT: tiene que tener 11 dígitos y un verificador válido.";
  const nominal = normalizarMonto(v.nominal);
  if (nominal === "" || BigInt(nominal) <= 0n) e.nominal = "Poné un nominal mayor a cero.";
  const dias = /^\d+$/.test(v.dias.trim()) ? Number(v.dias) : NaN;
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) e.dias = "El plazo va de 1 a 365 días.";
  if (Object.keys(e).length > 0) return { ok: false, errores: e };
  return {
    ok: true,
    activo: { id: `sorpresa-${n}`, cuit, nombre: `CUIT ${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`, tipo: v.tipo, nominal, dias },
  };
}

// ================================================================ Orquestador de la corrida

export interface ItemCorrida {
  id: string;
  activo: ActivoBandeja;
  reevaluacion: boolean; // vuelto a evaluar tras un rebote
  // pendiente: en cola de análisis · analizando: el agente trabaja · analizado: cotización lista, espera su turno
  // evaluado: el mandato dijo comprar/esperar · ejecutando: compra en curso · fin
  etapa: "pendiente" | "analizando" | "analizado" | "evaluado" | "ejecutando" | "fin";
  pasos: PasoAgente[];
  cotizacion?: Cotizacion;
  evaluacion?: EvaluacionMandato;
  compra?: CompraMandato | null;
  rechazoContrato?: { codigo: string; mensaje: string } | null;
  aprobado?: boolean;
  resultado?: ResultadoItem;
  error?: ErrorUi;
}

/** El activo al que le toca el turno: el primero de la bandeja que todavía no terminó. Los demás se analizan en segundo plano. */
export const itemEnTurno = (items: ItemCorrida[]): ItemCorrida | undefined => items.find((i) => i.etapa !== "fin");

export type FaseCorrida = "inactiva" | "iniciando" | "corriendo" | "pausada" | "esperando_aprobacion" | "terminada" | "revocada" | "fallo";

export interface ReboteRegistrado extends ReboteMandato {
  nombre: string;
}

export interface SnapshotCorrida {
  fase: FaseCorrida;
  estado: EstadoMandato | null;
  items: ItemCorrida[];
  rebotes: ReboteRegistrado[];
  fondoAntes: ResumenFondo | null;
  fondoDespues: ResumenFondo | null;
  aviso: ErrorUi | null; // error de acceso o fatal que pide una acción del usuario
  notas: string[];
  simularRebote: boolean;
  pausaPedida: boolean;
  revocando: boolean;
  rebotando: boolean;
}

export const CONCURRENCIA_ANALISIS = 4;

export interface ConfigCorrida {
  mandato: Mandato;
  activos: ActivoBandeja[];
  simularRebote: boolean;
  /** Cuántos análisis corren a la vez (por defecto 4). */
  concurrencia?: number;
}

type Escucha = () => void;

const INICIAL: SnapshotCorrida = {
  fase: "inactiva",
  estado: null,
  items: [],
  rebotes: [],
  fondoAntes: null,
  fondoDespues: null,
  aviso: null,
  notas: [],
  simularRebote: false,
  pausaPedida: false,
  revocando: false,
  rebotando: false,
};

const DETENER = "detener" as const;
const SEGUIR = "seguir" as const;
type Siguiente = typeof DETENER | typeof SEGUIR;

const ABORTADO = Symbol("abortado");

/** Resuelve con `ABORTADO` apenas se aborta la señal, aunque la llamada de fondo no responda: así revocar nunca queda esperando un análisis. */
function conAborto<T>(senal: AbortSignal, p: Promise<T>): Promise<T | typeof ABORTADO> {
  p.catch(() => undefined); // si pierde la carrera, su error no es una promesa rechazada sin atender
  if (senal.aborted) return Promise.resolve(ABORTADO);
  return new Promise((resolver, rechazar) => {
    const alAbortar = () => resolver(ABORTADO);
    senal.addEventListener("abort", alAbortar, { once: true });
    p.then(resolver, rechazar).finally(() => senal.removeEventListener("abort", alAbortar));
  });
}

/**
 * Corre el mandato en dos tiempos:
 *  - el ANÁLISIS de cada activo (gestor + scoring + cotización, ~30 s) no depende del estado: se lanzan todos en paralelo
 *    (concurrencia máxima configurable) con el estado inicial y sin evaluar el mandato;
 *  - los activos se PROCESAN en el orden de la bandeja (el orden de las compras y del estado es determinista): cuando el análisis
 *    del que sigue está listo se evalúa el mandato con el estado vigente (instantáneo) y, si da `comprar`, se ejecuta (2 txs).
 * Siempre guarda el último estado firmado que devolvió el servidor y lo manda en la llamada siguiente.
 * Pausa: los análisis en curso terminan, pero no se lanzan más ni se ejecuta nada. Revocación: se abortan los análisis
 * (AbortController); una compra en curso nunca se corta a medias.
 */
export class CorridaMandato {
  private snap: SnapshotCorrida = INICIAL;
  private escuchas = new Set<Escucha>();
  private bucle: Promise<void> | null = null;
  private otraVuelta = false;
  private revocacionPedida = false;
  private reboteHecho = false;
  private contadorSorpresa = 0;
  private activosPorId = new Map<string, ActivoBandeja>();
  private replanEncolado = new Set<string>(); // chequeId de rebotes ya replanificados
  private concurrencia = CONCURRENCIA_ANALISIS;
  private analisis = new Map<string, Promise<void>>(); // id del item → análisis en curso
  private abortador = new AbortController();

  constructor(private readonly cliente: ClienteMandato) {}

  // ---- suscripción (compatible con useSyncExternalStore)
  subscribe = (fn: Escucha): (() => void) => {
    this.escuchas.add(fn);
    return () => this.escuchas.delete(fn);
  };
  getSnapshot = (): SnapshotCorrida => this.snap;

  private poner(parcial: Partial<SnapshotCorrida>) {
    this.snap = { ...this.snap, ...parcial };
    this.escuchas.forEach((f) => f());
  }
  private cambiar(id: string, parcial: Partial<ItemCorrida> | ((i: ItemCorrida) => Partial<ItemCorrida>)) {
    this.poner({ items: this.snap.items.map((i) => (i.id === id ? { ...i, ...(typeof parcial === "function" ? parcial(i) : parcial) } : i)) });
  }
  private nota(texto: string) {
    this.poner({ notas: [...this.snap.notas, texto] });
  }
  private item(id: string): ItemCorrida {
    const i = this.snap.items.find((x) => x.id === id);
    if (!i) throw new Error(`Item inexistente: ${id}`);
    return i;
  }
  private get estado(): EstadoMandato {
    if (!this.snap.estado) throw new Error("La corrida no tiene estado");
    return this.snap.estado;
  }

  // ---- acciones del usuario
  setSimularRebote(v: boolean) {
    this.poner({ simularRebote: v });
  }

  async iniciar(cfg: ConfigCorrida): Promise<void> {
    if (this.snap.fase !== "inactiva" && this.snap.fase !== "fallo") return;
    this.revocacionPedida = false;
    this.reboteHecho = false;
    this.contadorSorpresa = 0;
    this.replanEncolado.clear();
    this.analisis.clear();
    this.abortador = new AbortController();
    this.concurrencia = Math.max(1, Math.floor(cfg.concurrencia ?? CONCURRENCIA_ANALISIS));
    this.activosPorId = new Map(cfg.activos.map((a) => [a.id, a]));
    this.snap = { ...INICIAL, fase: "iniciando", simularRebote: cfg.simularRebote };
    this.poner({});
    // Una foto del fondo antes de tocar nada: si falla no frena la corrida, el informe lo aclara.
    const fondoAntes = await this.cliente.fondo().catch(() => null);
    let estado: EstadoMandato;
    try {
      estado = await this.cliente.iniciar(cfg.mandato);
    } catch (e) {
      this.poner({ fase: "fallo", aviso: mensajeDeError(e), fondoAntes });
      return;
    }
    this.poner({
      estado,
      fondoAntes,
      items: cfg.activos.map((a) => ({ id: a.id, activo: a, reevaluacion: false, etapa: "pendiente", pasos: [] })),
    });
    this.arrancar();
  }

  /** Vuelve a las reglas (después de un fallo, una revocación o una corrida terminada). Conserva el interruptor de rebote. */
  reiniciar() {
    const f = this.snap.fase;
    if (f !== "fallo" && f !== "terminada" && f !== "revocada") return;
    this.abortarAnalisis();
    this.snap = { ...INICIAL, simularRebote: this.snap.simularRebote };
    this.poner({});
  }

  pausar() {
    if (this.snap.fase === "corriendo" && !this.snap.revocando) this.poner({ pausaPedida: true });
  }

  reanudar() {
    if (this.snap.fase !== "pausada") return;
    this.poner({ pausaPedida: false, aviso: null });
    this.arrancar();
  }

  aprobar(id: string) {
    const i = this.snap.items.find((x) => x.id === id);
    if (this.snap.fase !== "esperando_aprobacion" || i?.resultado !== "esperando_aprobacion") return;
    this.cambiar(id, { aprobado: true });
    this.arrancar();
  }

  omitir(id: string) {
    const i = this.snap.items.find((x) => x.id === id);
    if (this.snap.fase !== "esperando_aprobacion" || i?.resultado !== "esperando_aprobacion") return;
    this.cambiar(id, { resultado: "omitido_por_vos", etapa: "fin" });
    this.arrancar();
  }

  /** CUIT sorpresa: el mismo circuito para un activo extra (se analiza en paralelo con el resto). Si la corrida ya terminó, la retoma. */
  agregarSorpresa(activo: Omit<ActivoBandeja, "id"> & { id?: string }): string | null {
    const f = this.snap.fase;
    if (f === "inactiva" || f === "iniciando" || f === "revocada" || f === "fallo") return null;
    this.contadorSorpresa += 1;
    const id = activo.id ?? `sorpresa-${this.contadorSorpresa}`;
    const completo: ActivoBandeja = { ...activo, id };
    this.activosPorId.set(id, completo);
    this.poner({ items: [...this.snap.items, { id, activo: completo, reevaluacion: false, etapa: "pendiente", pasos: [] }] });
    if (f === "terminada") this.arrancar();
    else this.lanzarPendientes();
    return id;
  }

  /** Aborta los análisis en curso, espera a que termine una compra en curso (así no se pierde), revoca con el último estado y cierra la corrida. */
  async revocar(): Promise<void> {
    const f = this.snap.fase;
    if (this.snap.revocando || (f !== "corriendo" && f !== "pausada" && f !== "esperando_aprobacion")) return;
    this.revocacionPedida = true;
    this.poner({ revocando: true });
    this.abortarAnalisis();
    if (this.bucle) await this.bucle;
    try {
      const estado = await this.cliente.revocar(this.estado);
      this.revocacionPedida = false;
      this.poner({
        estado,
        revocando: false,
        rebotando: false,
        aviso: null,
        items: this.snap.items.map((i) =>
          i.etapa === "fin" || i.resultado === "compro" ? i : { ...i, etapa: "fin", resultado: "cancelado", error: undefined },
        ),
      });
      const fondoDespues = await this.cliente.fondo().catch(() => null);
      this.poner({ fase: "revocada", fondoDespues });
    } catch (e) {
      this.revocacionPedida = false;
      // No se pudo revocar: la corrida queda pausada para que se pueda reintentar o reanudar (los análisis abortados vuelven a la cola).
      this.poner({ revocando: false, fase: "pausada", pausaPedida: true, aviso: mensajeDeError(e) });
    }
  }

  // ---- análisis en paralelo
  /** Corta los análisis en curso; los que no terminaron vuelven a la cola (si no se revoca, se retoman al reanudar). */
  private abortarAnalisis() {
    this.abortador.abort();
    this.abortador = new AbortController();
    this.analisis.clear();
    if (this.snap.items.some((i) => i.etapa === "analizando")) {
      this.poner({ items: this.snap.items.map((i) => (i.etapa === "analizando" ? { ...i, etapa: "pendiente", pasos: [] } : i)) });
    }
  }

  /** Lanza, en el orden de la bandeja, los análisis que faltan hasta llenar la concurrencia. No lanza nada en pausa ni al revocar. */
  private lanzarPendientes() {
    if (this.revocacionPedida || this.snap.pausaPedida || this.snap.revocando) return;
    if (this.snap.fase !== "corriendo" && this.snap.fase !== "esperando_aprobacion") return;
    for (const i of this.snap.items) {
      if (this.analisis.size >= this.concurrencia) break;
      if (i.etapa === "pendiente" && !this.analisis.has(i.id)) this.lanzar(i.id);
    }
  }

  private lanzar(id: string) {
    const senal = this.abortador.signal;
    this.cambiar(id, { etapa: "analizando", pasos: [], error: undefined });
    const p: Promise<void> = this.analizarItem(id, senal).finally(() => {
      if (this.analisis.get(id) === p) this.analisis.delete(id);
      this.lanzarPendientes();
    });
    this.analisis.set(id, p);
  }

  /** Un análisis sin compra se puede reintentar una vez sin riesgo; si falla de nuevo, la tarjeta queda con el error y las demás siguen. */
  private async analizarItem(id: string, senal: AbortSignal): Promise<void> {
    for (let intento = 1; ; intento++) {
      const item = this.item(id);
      try {
        const r = await conAborto(
          senal,
          this.cliente.analizar(
            this.estado,
            item.activo,
            {
              onPaso: (p) => {
                if (!senal.aborted) this.cambiar(id, (i) => ({ pasos: [...i.pasos, p] }));
              },
              onReinicio: () => {
                if (!senal.aborted) this.cambiar(id, { pasos: [] });
              },
            },
            senal,
          ),
        );
        if (r === ABORTADO || senal.aborted) return;
        this.cambiar(id, { etapa: "analizado", cotizacion: r });
        return;
      } catch (e) {
        if (senal.aborted) return;
        const err = mensajeDeError(e);
        if (this.fatalSiCorresponde(err)) return;
        if (intento < 2) {
          this.cambiar(id, { pasos: [] });
          continue;
        }
        this.cambiar(id, { etapa: "fin", resultado: "error", error: err });
        return;
      }
    }
  }

  // ---- bucle
  private arrancar() {
    this.poner({ fase: "corriendo", pausaPedida: false, aviso: null });
    this.lanzarPendientes();
    // El bucle anterior puede estar terminando (acaba de dejar la corrida en pausa o terminada): se encadena una vuelta más.
    if (this.bucle) {
      this.otraVuelta = true;
      return;
    }
    const ejecutar = async () => {
      do {
        this.otraVuelta = false;
        await this.correr();
      } while (this.otraVuelta);
    };
    this.bucle = ejecutar().finally(() => {
      this.bucle = null;
    });
  }

  private async correr(): Promise<void> {
    for (;;) {
      if (this.revocacionPedida) return;
      if (this.snap.fase === "fallo" || this.snap.fase === "revocada") return;
      if (this.snap.pausaPedida) {
        this.poner({ fase: "pausada" });
        return;
      }
      const item = itemEnTurno(this.snap.items);
      if (item) {
        if ((await this.procesar(item.id)) === DETENER) return;
        continue;
      }
      if (this.snap.simularRebote && (!this.reboteHecho || this.replanPendiente())) {
        if ((await this.rebotarYReplanificar()) === DETENER) return;
        continue;
      }
      break;
    }
    const fondoDespues = await this.cliente.fondo().catch(() => null);
    this.poner({ fase: "terminada", fondoDespues, pausaPedida: false, rebotando: false });
  }

  /** Corta la corrida por un error de acceso: queda pausada, con el aviso, y se puede reanudar. */
  private pedirAcceso(error: ErrorUi): Siguiente {
    this.poner({ fase: "pausada", pausaPedida: true, aviso: error, rebotando: false });
    return DETENER;
  }

  private fatalSiCorresponde(error: ErrorUi): Siguiente | null {
    if (error.codigo === "MANDATO_REVOCADO") {
      this.abortarAnalisis();
      this.poner({
        estado: this.snap.estado ? { ...this.snap.estado, revocado: true } : this.snap.estado,
        fase: "revocada",
        aviso: error,
        rebotando: false,
        items: this.snap.items.map((i) => (i.etapa === "fin" ? i : { ...i, etapa: "fin", resultado: "cancelado" })),
      });
      return DETENER;
    }
    if (error.codigo === "ESTADO_INVALIDO") {
      this.abortarAnalisis();
      this.poner({ fase: "fallo", aviso: error, rebotando: false });
      return DETENER;
    }
    return null;
  }

  private async procesar(id: string): Promise<Siguiente> {
    let item = this.item(id);
    if (item.etapa === "pendiente" || item.etapa === "analizando") {
      // Le toca el turno: si todavía no arrancó su análisis, arranca ahora; después se espera (los de atrás siguen en segundo plano).
      if (item.etapa === "pendiente" && !this.analisis.has(id)) this.lanzar(id);
      await this.analisis.get(id);
      if (this.revocacionPedida) return DETENER;
      if (this.snap.fase === "fallo" || this.snap.fase === "revocada") return DETENER;
      item = this.item(id);
      if (item.etapa === "fin") return SEGUIR; // el análisis falló: la tarjeta ya tiene su error
      if (item.etapa !== "analizado") return DETENER; // se abortó (una revocación que no pudo completarse): vuelve a la cola
    }
    if (item.etapa === "analizado") {
      if (!item.cotizacion) return DETENER;
      let ev: EvaluacionMandato;
      try {
        ev = await this.cliente.evaluar(this.estado, item.activo, item.cotizacion); // con el estado de AHORA
      } catch (e) {
        const err = mensajeDeError(e);
        const fatal = this.fatalSiCorresponde(err);
        if (fatal) return fatal;
        this.cambiar(id, { etapa: "fin", resultado: "error", error: err });
        return SEGUIR;
      }
      if (ev.resultado === "omitir") {
        this.cambiar(id, { etapa: "fin", evaluacion: ev, resultado: "omitio" });
        return SEGUIR;
      }
      if (ev.resultado === "pendiente_aprobacion") {
        this.cambiar(id, { etapa: "evaluado", evaluacion: ev, resultado: "esperando_aprobacion" });
        this.poner({ fase: "esperando_aprobacion" });
        return DETENER;
      }
      this.cambiar(id, { etapa: "evaluado", evaluacion: ev });
      // Si pidieron pausa o revocar durante la evaluación, la compra espera: el bucle lo ve en la próxima vuelta.
      if (this.snap.pausaPedida || this.revocacionPedida) return SEGUIR;
      item = this.item(id);
    }
    if (item.etapa === "evaluado") {
      if (item.resultado === "esperando_aprobacion" && !item.aprobado) {
        this.poner({ fase: "esperando_aprobacion" });
        return DETENER;
      }
      return this.ejecutar(id);
    }
    return SEGUIR;
  }

  private async ejecutar(id: string): Promise<Siguiente> {
    const item = this.item(id);
    if (!item.evaluacion) return SEGUIR;
    this.cambiar(id, { etapa: "ejecutando" });
    try {
      const ej = await this.cliente.ejecutar(this.estado, item.evaluacion, item.aprobado === true);
      this.poner({ estado: ej.estado });
      this.cambiar(id, {
        etapa: "fin",
        compra: ej.compra,
        rechazoContrato: ej.rechazoContrato,
        resultado: ej.compra ? "compro" : ej.rechazoContrato ? "contrato_no" : "omitio",
      });
      return SEGUIR;
    } catch (e) {
      const err = mensajeDeError(e);
      if (esErrorDeAcceso(err.codigo)) {
        this.cambiar(id, { etapa: "evaluado" });
        return this.pedirAcceso(err);
      }
      const fatal = this.fatalSiCorresponde(err);
      if (fatal) return fatal;
      // Una compra pudo quedar a medias: no se reintenta sola.
      this.cambiar(id, { etapa: "fin", resultado: "error", error: err });
      return SEGUIR;
    }
  }

  /** Compras marcadas para rebotar y todavía vigentes. */
  private candidatosRebote(): ItemCorrida[] {
    const rechazadas = new Set(this.estado.compras.filter((c) => c.estado === "Rejected").map((c) => c.chequeId));
    return this.snap.items.filter((i) => i.resultado === "compro" && i.activo.reboteSimulado && i.compra && !rechazadas.has(i.compra.chequeId));
  }

  private replanPendiente(): boolean {
    return this.snap.rebotes.some((r) => !this.replanEncolado.has(r.chequeId));
  }

  private async rebotarYReplanificar(): Promise<Siguiente> {
    if (!this.reboteHecho) {
      const candidatos = this.candidatosRebote();
      if (candidatos.length === 0 && this.snap.rebotes.length === 0) {
        this.nota("No había ningún cheque comprado marcado para rebotar en esta demo.");
      }
      this.poner({ rebotando: candidatos.length > 0 });
      for (const c of candidatos) {
        if (this.revocacionPedida) return DETENER;
        if (this.snap.pausaPedida) {
          this.poner({ fase: "pausada", rebotando: false });
          return DETENER;
        }
        const chequeId = c.compra?.chequeId as string;
        try {
          const r = await this.cliente.rebote(this.estado, chequeId);
          this.poner({ estado: r.estado, rebotes: [...this.snap.rebotes, { ...r, nombre: c.compra?.nombre ?? c.activo.nombre }] });
        } catch (e) {
          const err = mensajeDeError(e);
          if (esErrorDeAcceso(err.codigo)) return this.pedirAcceso(err);
          const fatal = this.fatalSiCorresponde(err);
          if (fatal) return fatal;
          this.nota(`No se pudo simular el rebote de ${c.activo.nombre}: ${err.mensaje}`);
        }
      }
      this.reboteHecho = true;
      this.poner({ rebotando: false });
    }
    // Replanificación: volver a evaluar, con el estado nuevo, los activos que el servidor marcó. No hace falta volver a analizarlos:
    // la cotización ya firmada no depende del estado. Si el primer análisis había fallado, se analiza de nuevo.
    const nuevos: ItemCorrida[] = [];
    for (const r of this.snap.rebotes) {
      if (this.replanEncolado.has(r.chequeId)) continue;
      this.replanEncolado.add(r.chequeId);
      for (const aid of r.replanificar) {
        const activo = this.activosPorId.get(aid);
        if (!activo) continue;
        const id = `${aid}#re${nuevos.length + this.snap.items.filter((i) => i.reevaluacion).length + 1}`;
        const previo = [...this.snap.items].reverse().find((i) => i.activo.id === aid && i.cotizacion);
        nuevos.push(
          previo?.cotizacion
            ? { id, activo, reevaluacion: true, etapa: "analizado", pasos: previo.pasos, cotizacion: previo.cotizacion }
            : { id, activo, reevaluacion: true, etapa: "pendiente", pasos: [] },
        );
      }
    }
    if (nuevos.length > 0) {
      this.poner({ items: [...this.snap.items, ...nuevos] });
      this.lanzarPendientes();
    }
    return SEGUIR;
  }
}

// ================================================================ Contadores

/** Cuenta por activo según su último resultado (una reevaluación reemplaza a la omisión original). */
export function contadores(items: ItemCorrida[]) {
  const ultimo = new Map<string, ItemCorrida>();
  for (const i of items) ultimo.set(i.activo.id, i);
  const c = { total: ultimo.size, comprados: 0, omitidos: 0, rechazados: 0, esperando: 0, errores: 0, procesados: 0 };
  for (const i of ultimo.values()) {
    if (i.etapa === "fin") c.procesados += 1;
    if (i.resultado === "compro") c.comprados += 1;
    else if (i.resultado === "omitio" || i.resultado === "omitido_por_vos") c.omitidos += 1;
    else if (i.resultado === "contrato_no") c.rechazados += 1;
    else if (i.resultado === "esperando_aprobacion") c.esperando += 1;
    else if (i.resultado === "error") c.errores += 1;
  }
  return c;
}

// ================================================================ Informe

export interface FotoFondo {
  patrimonio: string;
  liquidezBps: number;
  valorCuotaparte: string;
}

export interface InformeVista {
  mandato: Mandato;
  revocado: boolean;
  antes: FotoFondo | null;
  despues: FotoFondo | null;
  comprados: CompraMandato[];
  omitidos: { activoId: string; nombre: string; razones: RazonMandato[] }[];
  rechazadosPorContrato: { activoId: string; nombre: string; codigo: string; mensaje: string }[];
  errores: { activoId: string; nombre: string; mensaje: string }[];
  rebotes: {
    chequeId: string;
    nombre: string;
    perdida: string;
    explicacion: string;
    tx: string;
    emisorBloqueado: string;
    replanificados: { activoId: string; nombre: string; resultado: string }[];
  }[];
  invertido: string;
  disponible: string;
}

const foto = (f: ResumenFondo | null): FotoFondo | null => (f ? { patrimonio: f.totalAssets, liquidezBps: f.liquidezBps, valorCuotaparte: f.valorCuotaparte } : null);

export function armarInforme(s: SnapshotCorrida): InformeVista | null {
  if (!s.estado) return null;
  const ultimo = new Map<string, ItemCorrida>();
  for (const i of s.items) ultimo.set(i.activo.id, i);
  const finales = [...ultimo.values()];
  const nombre = (i: ItemCorrida) => i.compra?.nombre ?? i.activo.nombre;

  return {
    mandato: s.estado.mandato,
    revocado: s.estado.revocado,
    antes: foto(s.fondoAntes),
    despues: foto(s.fondoDespues),
    comprados: s.estado.compras,
    omitidos: finales
      .filter((i) => i.resultado === "omitio" || i.resultado === "omitido_por_vos")
      .map((i) => ({ activoId: i.activo.id, nombre: nombre(i), razones: (i.evaluacion?.razones ?? []).filter((r) => !r.cumple) })),
    rechazadosPorContrato: finales
      .filter((i) => i.resultado === "contrato_no" && i.rechazoContrato)
      .map((i) => ({ activoId: i.activo.id, nombre: nombre(i), codigo: i.rechazoContrato?.codigo ?? "", mensaje: i.rechazoContrato?.mensaje ?? "" })),
    errores: finales.filter((i) => i.resultado === "error").map((i) => ({ activoId: i.activo.id, nombre: nombre(i), mensaje: i.error?.mensaje ?? "Error" })),
    rebotes: s.rebotes.map((r) => ({
      chequeId: r.chequeId,
      nombre: r.nombre,
      perdida: r.perdida,
      explicacion: r.explicacion,
      tx: r.tx,
      emisorBloqueado: r.emisorBloqueado,
      replanificados: r.replanificar.map((aid) => {
        const it = s.items.find((i) => i.reevaluacion && i.activo.id === aid);
        return {
          activoId: aid,
          nombre: it ? nombre(it) : (aid),
          resultado: it?.resultado ? ETIQUETA_RESULTADO[it.resultado].texto : "No se llegó a reevaluar",
        };
      }),
    })),
    invertido: s.estado.invertido,
    disponible: s.estado.disponible,
  };
}

/** Texto plano para pegar en un chat o un mail. */
export function resumenCopiable(inf: InformeVista): string {
  const L: string[] = [];
  L.push(inf.revocado ? "Informe del mandato (revocado)" : "Informe del mandato");
  L.push(`Presupuesto ${formatPesos(inf.mandato.presupuesto)} · invertido ${formatPesos(inf.invertido)} · disponible ${formatPesos(inf.disponible)}`);
  if (inf.antes && inf.despues) {
    L.push(`Patrimonio del fondo: ${formatPesos(inf.antes.patrimonio)} → ${formatPesos(inf.despues.patrimonio)}`);
    L.push(`Liquidez: ${formatBps(inf.antes.liquidezBps)} → ${formatBps(inf.despues.liquidezBps)}`);
    L.push(`Valor de la cuotaparte: ${formatPesos(inf.antes.valorCuotaparte)} → ${formatPesos(inf.despues.valorCuotaparte)}`);
  }
  L.push("", `Compras (${inf.comprados.length})`);
  for (const c of inf.comprados) L.push(`- ${c.nombre}: nominal ${formatPesos(c.nominal)}, pagó ${formatPesos(c.precioCompra)}${c.estado === "Rejected" ? " (rebotó)" : ""} · ${urlTx(c.tx)}`);
  if (inf.comprados.length === 0) L.push("- ninguna");
  L.push("", `Omitidos (${inf.omitidos.length})`);
  for (const o of inf.omitidos) L.push(`- ${o.nombre}${o.razones.length ? `: ${o.razones.map((r) => r.mensaje).join(" ")}` : ""}`);
  if (inf.rechazadosPorContrato.length) {
    L.push("", `Rechazados por el contrato (${inf.rechazadosPorContrato.length})`);
    for (const r of inf.rechazadosPorContrato) L.push(`- ${r.nombre}: ${r.codigo}${r.mensaje ? ` · ${r.mensaje}` : ""}`);
  }
  if (inf.rebotes.length) {
    L.push("", "Rebote (simulado en la demo)");
    for (const r of inf.rebotes) {
      L.push(`- ${r.nombre}: pérdida ${formatPesos(r.perdida)}. ${r.explicacion} · ${urlTx(r.tx)}`);
      for (const p of r.replanificados) L.push(`  Reevaluado: ${p.nombre} → ${p.resultado}`);
    }
  }
  if (inf.errores.length) {
    L.push("", "Con error");
    for (const e of inf.errores) L.push(`- ${e.nombre}: ${e.mensaje}`);
  }
  L.push("", "Prototipo · el fondo opera en testnet, sin dinero real · no es oferta pública");
  return L.join("\n");
}
