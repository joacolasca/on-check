// Cliente de la Central de Deudores del BCRA: respuesta en vivo con timeout de 3 s y copia guardada como respaldo (D12).
import { leerCopia } from "./cache";
import { CuitInvalidoError, CuitSinDatosError, type ChequeRechazadoBcra, type DatosBcra, type EntidadDeuda } from "./bcra-tipos";

const BASE = "https://api.bcra.gob.ar/centraldedeudores/v1.0";
export const TIMEOUT_BCRA_MS = 3000;

type Json = Record<string, unknown>;
const arr = (x: unknown): Json[] => (Array.isArray(x) ? (x as Json[]) : []);
const num = (x: unknown): number => (typeof x === "number" ? x : 0);

/** Normaliza las tres respuestas del BCRA (en vivo o de la copia) a DatosBcra. */
export function normalizar(
  cuit: string,
  deudas: unknown,
  historicas: unknown,
  rechazados: unknown | null,
  fuente: DatosBcra["fuente"],
  consultadoEn: string,
  rechazadosVerificados = true,
): DatosBcra {
  const d = (deudas as { results?: Json } | null)?.results ?? {};
  // El más reciente primero, sin confiar en el orden en que lo mande el BCRA.
  const periodos = arr(d.periodos).sort((a, b) => String(b.periodo ?? "").localeCompare(String(a.periodo ?? "")));
  const entidadesActuales: EntidadDeuda[] = arr(periodos[0]?.entidades).map((e) => ({
    entidad: String(e.entidad ?? ""),
    situacion: num(e.situacion),
    monto: num(e.monto),
    refinanciaciones: e.refinanciaciones === true,
    juridico: e.situacionJuridica === true || e.procesoJud === true,
  }));

  const h = (historicas as { results?: Json } | null)?.results ?? {};
  const deudaPorPeriodo = arr(h.periodos)
    .map((p) => ({ periodo: String(p.periodo ?? ""), total: arr(p.entidades).reduce((acc, e) => acc + num(e.monto), 0) }))
    .sort((a, b) => b.periodo.localeCompare(a.periodo));

  const r = (rechazados as { results?: Json } | null)?.results ?? {};
  const rech: ChequeRechazadoBcra[] = [];
  for (const causal of arr(r.causales)) {
    for (const ent of arr(causal.entidades)) {
      for (const det of arr(ent.detalle)) {
        rech.push({ fechaRechazo: String(det.fechaRechazo ?? ""), causal: String(causal.causal ?? ""), impago: det.fechaPago == null, enRevision: det.enRevision === true });
      }
    }
  }

  return {
    cuit,
    denominacion: typeof d.denominacion === "string" ? d.denominacion : null,
    entidadesActuales,
    deudaPorPeriodo,
    rechazados: rech,
    ...(rechazadosVerificados ? {} : { rechazadosVerificados: false }),
    fuente,
    consultadoEn,
  };
}

/**
 * 11 dígitos con dígito verificador válido (módulo 11, pesos 5-4-3-2-7-6-5-4-3-2).
 * Si el resto da 10 no existe un dígito válido (AFIP cambia el prefijo a 23/33 en esos casos), así que esa base se rechaza.
 */
export function cuitValido(cuit: string): boolean {
  if (!/^(20|23|24|27|30|33|34)\d{9}$/.test(cuit)) return false; // prefijos de personas (20-27) y de sociedades (30-34)
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(cuit[i]), 0);
  const resto = 11 - (suma % 11);
  const dv = Number(cuit[10]);
  if (resto === 11) return dv === 0;
  if (resto !== 10) return dv === resto;
  return false;
}

export interface OpcionesBcra {
  modo?: "live" | "cache" | "auto";
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  ahora?: Date;
}

async function pedir(fetchFn: typeof fetch, ruta: string, senal: AbortSignal): Promise<{ status: number; cuerpo: unknown }> {
  const res = await fetchFn(`${BASE}/${ruta}`, { signal: senal, headers: { accept: "application/json" } });
  let cuerpo: unknown = null;
  try {
    cuerpo = await res.json();
  } catch {
    // cuerpo vacío o no JSON: lo decide el status
  }
  return { status: res.status, cuerpo };
}

async function consultarEnVivo(cuit: string, o: Required<Pick<OpcionesBcra, "fetchFn" | "timeoutMs" | "ahora">>): Promise<DatosBcra> {
  const senal = AbortSignal.timeout(o.timeoutMs);
  const [deudas, historicas, rechazados] = await Promise.all([
    pedir(o.fetchFn, `Deudas/${cuit}`, senal),
    pedir(o.fetchFn, `Deudas/Historicas/${cuit}`, senal),
    // Si solo falla este pedido no se pierde toda la consulta: queda "sin verificar".
    pedir(o.fetchFn, `Deudas/ChequesRechazados/${cuit}`, senal).catch(() => ({ status: 0, cuerpo: null })),
  ]);
  if (deudas.status === 404) throw new CuitSinDatosError(cuit);
  if (deudas.status !== 200 || historicas.status !== 200) {
    throw new Error(`El BCRA respondió ${deudas.status}/${historicas.status}`);
  }
  // 404 en ChequesRechazados = sin rechazos (verificado). Cualquier otro status (429, 5xx, timeout) = no se pudo verificar.
  const verificados = rechazados.status === 200 || rechazados.status === 404;
  return normalizar(cuit, deudas.cuerpo, historicas.cuerpo, rechazados.status === 200 ? rechazados.cuerpo : null, "bcra-live", o.ahora.toISOString(), verificados);
}

async function desdeCopia(cuit: string): Promise<DatosBcra | null> {
  const c = await leerCopia(cuit);
  return c ? normalizar(cuit, c.deudas, c.historicas, c.chequesRechazados, "bcra-cache", c.consultadoEn) : null;
}

/** Consulta al BCRA. `auto`: en vivo con timeout y, si falla, copia guardada. Un CUIT que el BCRA no conoce es un error definitivo. */
export async function consultarBcra(cuit: string, op: OpcionesBcra = {}): Promise<DatosBcra> {
  const modo = op.modo ?? "auto";
  if (!cuitValido(cuit)) throw new CuitInvalidoError(cuit);
  if (modo === "cache") {
    const c = await desdeCopia(cuit);
    if (!c) throw new Error(`No hay copia guardada del BCRA para el CUIT ${cuit}.`);
    return c;
  }
  try {
    const vivo = await consultarEnVivo(cuit, { fetchFn: op.fetchFn ?? fetch, timeoutMs: op.timeoutMs ?? TIMEOUT_BCRA_MS, ahora: op.ahora ?? new Date() });
    if (vivo.rechazadosVerificados === false && modo === "auto") return (await desdeCopia(cuit)) ?? vivo; // sin cheques rechazados en vivo: la copia, si existe
    return vivo;
  } catch (err) {
    if (err instanceof CuitSinDatosError || modo === "live") throw err;
    const c = await desdeCopia(cuit);
    if (c) return c;
    throw new Error("No pudimos consultar el BCRA y no hay copia guardada de este CUIT.");
  }
}
