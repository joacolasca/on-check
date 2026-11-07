// Las cotizaciones viven un rato en memoria hasta que se registran onchain (el contrato guarda solo el hash).
// En un servidor con varias instancias la memoria no se comparte: por eso /api/cheques también acepta la cotización completa y la valida por su hash.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parseUnits } from "viem";
import type { InformeActivo } from "@/lib/agent/informe";
import { cotizacionIntegra } from "@/lib/scoring";
import { canonico } from "@/lib/scoring/cotizar";
import { TIPOS_GARANTIA, type Cotizacion } from "@/shared/types";
import { ErrorApi } from "./errores";
import { INDUSTRIA_MAX_ID } from "./industrias";

const TTL_MS = 60 * 60 * 1000;
/** La firma de una cotización vale 30 minutos. */
export const VIGENCIA_FIRMA_S = 30 * 60;
const SECRETO_MIN = 32;
const g = globalThis as unknown as {
  __cotizaciones?: Map<string, { cot: Cotizacion; hasta: number }>;
  __cotizacionSecretoLocal?: string;
  __chequesUsados?: Map<string, number>;
  __informes?: Map<string, { informe: InformeActivo; hasta: number }>;
};
const almacen = (g.__cotizaciones ??= new Map());
// Informes de los activos: en memoria (sin base de datos), más tiempo que la cotización y con tope de cantidad.
const TTL_INFORME_MS = 12 * 60 * 60 * 1000;
export const MAX_INFORMES = 200;
const informes = (g.__informes ??= new Map());
const usados = (g.__chequesUsados ??= new Map());

/**
 * Secreto del HMAC (env COTIZACION_SECRETO, ≥ 32 caracteres).
 * Sin secreto: en producción falla cerrado (503); en desarrollo/test usa uno aleatorio por proceso
 * (las firmas valen mientras viva el proceso, que es lo único que hace falta fuera de producción).
 */
function secreto(): string {
  const s = process.env.COTIZACION_SECRETO;
  if (s && s.length >= SECRETO_MIN) return s;
  if (process.env.NODE_ENV === "production") {
    throw new ErrorApi("CONFIGURACION", "El servidor no tiene configurado el secreto de las cotizaciones (COTIZACION_SECRETO, mínimo 32 caracteres).", 503);
  }
  return (g.__cotizacionSecretoLocal ??= randomBytes(32).toString("hex"));
}

/** HMAC-SHA256 (hex) de un texto con el mismo secreto (y el mismo fallback de desarrollo) que las cotizaciones. Lo usa el estado firmado del mandato. */
export function hmacConSecreto(texto: string): string {
  return createHmac("sha256", secreto()).update(texto).digest("hex");
}

/** HMAC-SHA256 (hex) del contenido que importa para registrar el cheque. */
function hmacDe(cot: Cotizacion, exp: number): string {
  const payload = canonico({
    v: 2,
    exp,
    id: cot.id,
    cotizacionHash: cot.cotizacionHash,
    pyme: cot.input.pyme.toLowerCase(),
    libradorHash: cot.libradorHash,
    nominal: cot.input.nominal,
    precioCompra: cot.precioCompra,
    vencimiento: cot.input.vencimiento,
    aprobada: cot.aprobada,
    // v2: lo que va al struct del contrato, explícito en la firma además del hash canónico
    tipo: cot.tipo ?? null,
    industria: cot.industria?.id ?? null,
    garantiaTipo: cot.garantia?.tipo ?? null,
    garantiaCoberturaBps: cot.garantia?.coberturaBps ?? null,
    garantiaHash: cot.garantia?.garantiaHash ?? null,
  });
  return createHmac("sha256", secreto()).update(payload).digest("hex");
}

const COTIZACION_INVALIDA = (mensaje: string) => new ErrorApi("COTIZACION_INVALIDA", mensaje, 403);

/**
 * Guarda la cotización y le pone `firma` EN EL MISMO OBJETO (mutación a propósito: la ruta del agente guarda y
 * después responde ese objeto, así sale firmado sin tocarla).
 */
export function guardarCotizacion(cot: Cotizacion): void {
  const ahora = Date.now();
  cot.firma = firmarCotizacion(cot, ahora);
  for (const [id, v] of almacen) if (v.hasta < ahora) almacen.delete(id);
  almacen.set(cot.id.toLowerCase(), { cot, hasta: ahora + TTL_MS });
}

/** `${exp}.${hmacHex}` con vencimiento a 30 minutos de `ahoraMs`. */
export function firmarCotizacion(cot: Cotizacion, ahoraMs = Date.now()): string {
  const exp = Math.floor(ahoraMs / 1000) + VIGENCIA_FIRMA_S;
  return `${exp}.${hmacDe(cot, exp)}`;
}

/** Valida la firma de una cotización que vino del cliente. Lanza 403 COTIZACION_INVALIDA si algo no cierra. */
function verificarCotizacionDelCliente(id: string, cot: Cotizacion, ahoraMs = Date.now()): void {
  const m = typeof cot.firma === "string" ? /^(\d{1,12})\.([0-9a-f]{64})$/.exec(cot.firma) : null;
  if (!m) throw COTIZACION_INVALIDA("La cotización no trae una firma válida. Volvé a cotizar el cheque.");
  const exp = Number(m[1]);
  let esperado: string;
  try {
    esperado = hmacDe(cot, exp);
  } catch (e) {
    if (e instanceof ErrorApi) throw e;
    throw COTIZACION_INVALIDA("La cotización no es válida. Volvé a cotizar el cheque.");
  }
  if (!timingSafeEqual(Buffer.from(m[2], "hex"), Buffer.from(esperado, "hex"))) throw COTIZACION_INVALIDA("La cotización no coincide con la que firmó el servidor. Volvé a cotizar el cheque.");
  if (exp * 1000 <= ahoraMs) throw COTIZACION_INVALIDA("La cotización venció, volvé a cotizar el cheque.");
  const { firma: _firma, ...sinFirma } = cot;
  void _firma;
  if (cot.id.toLowerCase() !== id.toLowerCase() || !cotizacionIntegra(sinFirma as Cotizacion)) {
    throw COTIZACION_INVALIDA("La cotización no coincide con la que firmó el servidor. Volvé a cotizar el cheque.");
  }
}

/** ¿Ese cheque ya se registró (en esta instancia)? La clave es `${contrato}:${id}`. Es un freno previo: el contrato también revierte ids repetidos. */
export function chequeYaUsado(id: string, ahoraMs = Date.now()): boolean {
  const hasta = usados.get(id.toLowerCase());
  return hasta !== undefined && hasta > ahoraMs;
}

/** Marca el id como usado por 2 horas (más que la vigencia de la firma). */
export function marcarChequeUsado(id: string, ahoraMs = Date.now()): void {
  for (const [k, hasta] of usados) if (hasta <= ahoraMs) usados.delete(k);
  usados.set(id.toLowerCase(), ahoraMs + 2 * 60 * 60 * 1000);
}

/** Guarda el informe del activo (clave: id de la cotización = id del activo). Vence a las 12 h y guarda como máximo MAX_INFORMES. */
export function guardarInforme(id: string, informe: InformeActivo, ahora = Date.now()): void {
  for (const [k, v] of informes) if (v.hasta < ahora) informes.delete(k);
  const clave = id.toLowerCase();
  informes.delete(clave);
  while (informes.size >= MAX_INFORMES) {
    const masViejo = informes.keys().next().value;
    if (masViejo === undefined) break;
    informes.delete(masViejo);
  }
  informes.set(clave, { informe, hasta: ahora + TTL_INFORME_MS });
}

export function obtenerInforme(id: string, ahora = Date.now()): InformeActivo | null {
  const v = informes.get(id.toLowerCase());
  return v && v.hasta >= ahora ? v.informe : null;
}

export function obtenerExplicacion(id: string): string | undefined {
  return almacen.get(id.toLowerCase())?.cot.explicacion;
}

/** Busca la cotización en memoria; si no está, usa la que mandó el cliente solo si trae una firma válida del servidor y su hash corresponde a su contenido. */
export function resolverCotizacion(id: string, delCliente?: Cotizacion): Cotizacion {
  const guardada = almacen.get(id.toLowerCase())?.cot;
  if (guardada) return guardada;
  if (delCliente && typeof delCliente === "object" && delCliente.input && typeof delCliente.id === "string") {
    verificarCotizacionDelCliente(id, delCliente);
    return delCliente;
  }
  throw new ErrorApi("COTIZACION_NO_ENCONTRADA", "No encontramos esa cotización (puede haber vencido). Volvé a cotizar el cheque.", 404);
}

const BYTES32_CERO = `0x${"0".repeat(64)}` as const;
const datosInvalidos = (m: string) => new ErrorApi("COTIZACION_INVALIDA", `La cotización no trae ${m}. Volvé a cotizar el cheque.`, 403);

/**
 * Los campos v2 que van al struct del contrato, tomados de la cotización. Exige que estén: tipo, industria (id de
 * shared/industrias.json) y, si hay garantía, su tipo, cobertura y hash (la firma y el hash de la cotización ya los cubren).
 */
export function camposV2(cot: Cotizacion) {
  if (cot.tipo !== "cheque" && cot.tipo !== "pagare") throw datosInvalidos("el tipo (cheque o pagaré)");
  const id = cot.industria?.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 0 || id > INDUSTRIA_MAX_ID) throw datosInvalidos("una industria válida");
  const g = cot.garantia;
  let garantia = { tipoGarantia: 0, coberturaBps: 0, garantiaHash: BYTES32_CERO as `0x${string}` };
  if (g) {
    const orden = TIPOS_GARANTIA.indexOf(g.tipo);
    if (orden < 0) throw datosInvalidos("un tipo de garantía válido");
    if (!Number.isInteger(g.coberturaBps) || g.coberturaBps < 0 || g.coberturaBps > 65_535) throw datosInvalidos("una cobertura de garantía válida");
    if (typeof g.garantiaHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(g.garantiaHash)) throw datosInvalidos("el hash del análisis de la garantía");
    garantia = { tipoGarantia: orden, coberturaBps: g.coberturaBps, garantiaHash: g.garantiaHash as `0x${string}` };
  }
  return { tipo: cot.tipo === "pagare" ? 1 : 0, industria: id, ...garantia };
}

/** Datos del cheque (struct v2) para `registrarCheque`. Montos de pesos a unidades de 18 decimales. */
export function datosDeCheque(cot: Cotizacion) {
  if (!cot.aprobada) throw new ErrorApi("COTIZACION_RECHAZADA", cot.motivoRechazo ?? "Esa cotización no fue aprobada.", 422);
  if (!/^0x[0-9a-fA-F]{40}$/.test(cot.input.pyme)) throw new ErrorApi("DATOS_INVALIDOS", "La dirección de la pyme no es válida.", 400);
  // El cheque vence al final del día (hora de Buenos Aires).
  const vencimiento = BigInt(Math.floor(Date.parse(`${cot.input.vencimiento.slice(0, 10)}T23:59:59-03:00`) / 1000));
  return {
    libradorHash: cot.libradorHash as `0x${string}`,
    pyme: cot.input.pyme as `0x${string}`,
    nominal: parseUnits(cot.input.nominal, 18),
    precioCompra: parseUnits(cot.precioCompra, 18),
    vencimiento,
    puntaje: cot.scoring.puntaje,
    tasaBps: cot.tasaTnaBps,
    cotizacionHash: cot.cotizacionHash as `0x${string}`,
    ...camposV2(cot),
    estado: 0,
  };
}
