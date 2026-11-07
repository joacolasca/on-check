// Acceso a las rutas que firman con las wallets del servidor (kyc, invertir, liquidar, cheques, fondear).
// Credenciales aceptadas (una de las dos): header `x-demo-clave` (scripts) o cookie `demo_sesion` (navegador).
// Además: mismo origen con cookie, content-type JSON y rate limit. Todo en memoria, sin dependencias.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { error } from "./http";

export const COOKIE_SESION = "demo_sesion";
export const DURACION_SESION_S = 12 * 60 * 60;
const CLAVE_MIN = 16;

const enProduccion = () => process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------- clave

/** La clave de la demo, o null si falta o es demasiado corta. */
function claveConfigurada(): string | null {
  const c = process.env.DEMO_CLAVE;
  return c && c.length >= CLAVE_MIN ? c : null;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Comparación en tiempo constante: compara digests, así no se filtra ni el largo. */
export function igualesSeguros(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

/** Verifica una clave contra DEMO_CLAVE (false si no está configurada). */
export function claveValida(candidata: string): boolean {
  const clave = claveConfigurada();
  return clave !== null && igualesSeguros(candidata, clave);
}

// ---------------------------------------------------------------------------- cookie de sesión

const claveDeFirma = (clave: string) => createHmac("sha256", clave).update("demo_sesion:clave-de-firma").digest();
const firmar = (clave: string, exp: number) => createHmac("sha256", claveDeFirma(clave)).update(`demo_sesion:${exp}`).digest("hex");

/** Valor de la cookie: `${expUnix}.${hmacHex}`. */
export function crearValorSesion(ahoraMs = Date.now()): string | null {
  const clave = claveConfigurada();
  if (!clave) return null;
  const exp = Math.floor(ahoraMs / 1000) + DURACION_SESION_S;
  return `${exp}.${firmar(clave, exp)}`;
}

export function cabeceraSetCookie(valor: string): string {
  const partes = [`${COOKIE_SESION}=${valor}`, "HttpOnly", "SameSite=Strict", "Path=/", `Max-Age=${DURACION_SESION_S}`];
  if (enProduccion()) partes.push("Secure");
  return partes.join("; ");
}

function leerCookie(req: Request, nombre: string): string | null {
  for (const par of (req.headers.get("cookie") ?? "").split(";")) {
    const i = par.indexOf("=");
    if (i > 0 && par.slice(0, i).trim() === nombre) return par.slice(i + 1).trim();
  }
  return null;
}

function sesionValida(valor: string, clave: string, ahoraMs = Date.now()): boolean {
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(valor);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!igualesSeguros(m[2], firmar(clave, exp))) return false;
  return exp * 1000 > ahoraMs;
}

function mismoOrigen(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const sitio = req.headers.get("sec-fetch-site");
  return sitio === null || sitio === "same-origin" || sitio === "none";
}

// ---------------------------------------------------------------------------- rate limit
// Token bucket en memoria (globalThis). Best-effort por instancia: en un despliegue serverless cada instancia
// tiene su propio contador, así que no es un límite global exacto. Frena el abuso casual, no un ataque distribuido.

interface Balde {
  tokens: number;
  ts: number;
}
export interface LimitesGrupo {
  porIpPorMin: number;
  globalPorMin: number;
}
export const LIMITES = {
  firmantes: { porIpPorMin: 20, globalPorMin: 60 },
  acceso: { porIpPorMin: 5, globalPorMin: 30 }, // anti fuerza bruta de la clave
} as const satisfies Record<string, LimitesGrupo>;
export type GrupoLimite = keyof typeof LIMITES;

const g = globalThis as unknown as { __demoBaldes?: Map<string, Balde> };
const baldes = (): Map<string, Balde> => (g.__demoBaldes ??= new Map());

/** Para los tests. */
export function reiniciarLimites(): void {
  baldes().clear();
}

/** Intenta sacar un token del balde. Devuelve 0 si pasó o los segundos hasta que haya uno. */
function tomar(clave: string, porMin: number, ahora: number): number {
  const m = baldes();
  const b = m.get(clave) ?? { tokens: porMin, ts: ahora };
  b.tokens = Math.min(porMin, b.tokens + ((ahora - b.ts) / 60_000) * porMin);
  b.ts = ahora;
  m.set(clave, b);
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return 0;
  }
  return Math.ceil(((1 - b.tokens) / porMin) * 60);
}

export function ipDe(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** 429 con Retry-After si se pasó de los límites; null si puede seguir. */
export function limitar(req: Request, grupo: GrupoLimite, ahora = Date.now()): Response | null {
  const { porIpPorMin, globalPorMin } = LIMITES[grupo];
  const m = baldes();
  if (m.size > 5000) for (const [k, b] of m) if (ahora - b.ts > 120_000) m.delete(k); // limpieza de IPs viejas
  const espera = tomar(`${grupo}:ip:${ipDe(req)}`, porIpPorMin, ahora) || tomar(`${grupo}:global`, globalPorMin, ahora);
  if (!espera) return null;
  const r = error("DEMASIADAS_SOLICITUDES", `Demasiadas solicitudes. Esperá ${espera} s y volvé a probar.`, 429);
  r.headers.set("retry-after", String(espera));
  return r;
}

// ---------------------------------------------------------------------------- guardia de las rutas

const NO_AUTORIZADO = "Esta acción es solo para el equipo de la demo. Entrá desde /api/demo/acceso.";

/**
 * Guardia de las rutas que firman. Devuelve la respuesta de error, o null si el pedido puede seguir.
 * Sin DEMO_CLAVE: en producción falla cerrado (503); en desarrollo local deja pasar (sigue exigiendo JSON y rate limit).
 */
export function exigirAcceso(req: Request): Response | null {
  const clave = claveConfigurada();
  if (!clave) {
    if (enProduccion()) return error("CONFIGURACION", "El servidor no tiene configurada la clave de la demo (DEMO_CLAVE, mínimo 16 caracteres).", 503);
  } else {
    const header = req.headers.get("x-demo-clave");
    const cookie = leerCookie(req, COOKIE_SESION);
    const porHeader = header !== null && igualesSeguros(header, clave);
    const porCookie = !porHeader && cookie !== null && sesionValida(cookie, clave);
    if (!porHeader && !porCookie) return error("NO_AUTORIZADO", NO_AUTORIZADO, 401);
    if (porCookie && !mismoOrigen(req)) return error("NO_AUTORIZADO", "El pedido viene de otro origen y no se acepta.", 403);
  }
  const tipo = req.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(tipo)) return error("DATOS_INVALIDOS", "El pedido tiene que enviarse con content-type: application/json.", 415);
  return limitar(req, "firmantes");
}
