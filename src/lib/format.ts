// Formateadores de presentación (es-AR). Los montos son strings decimales: nunca pasan por `number`.
import type { Banda, EstadoCheque } from "@/shared/types";

const SEP_MILES = ".";
const SEP_DECIMAL = ",";

function agrupar(enteros: string): string {
  return enteros.replace(/\B(?=(\d{3})+(?!\d))/g, SEP_MILES);
}

function partirDecimal(valor: string): { negativo: boolean; enteros: string; fraccion: string } {
  if (!/^-?\d+(\.\d+)?$/.test(valor)) throw new Error(`Monto inválido: ${valor}`);
  const negativo = valor.startsWith("-");
  const [enteros, fraccion = ""] = (negativo ? valor.slice(1) : valor).split(".");
  return { negativo, enteros, fraccion };
}

/** "10000000" → "$ 10.000.000". Muestra centavos solo si los hay (redondeo half-up con bigint). */
export function formatPesos(monto: string): string {
  const { negativo, enteros, fraccion } = partirDecimal(monto);
  const f = fraccion.padEnd(3, "0");
  let centavos = BigInt(enteros + f.slice(0, 2));
  if (f[2] >= "5") centavos += 1n;
  const e = (centavos / 100n).toString();
  const c = (centavos % 100n).toString().padStart(2, "0");
  const cuerpo = agrupar(e) + (c === "00" ? "" : SEP_DECIMAL + c);
  return `${negativo && centavos !== 0n ? "-" : ""}$ ${cuerpo}`;
}

/** "1.2345678" → "1,2346" (hasta `maxDecimales`, sin ceros al final, mínimo `minDecimales`). */
export function formatDecimal(valor: string, maxDecimales = 4, minDecimales = 0): string {
  const { negativo, enteros, fraccion } = partirDecimal(valor);
  const escala = 10n ** BigInt(maxDecimales);
  const f = fraccion.padEnd(maxDecimales + 1, "0");
  let total = BigInt(enteros + f.slice(0, maxDecimales));
  if (f[maxDecimales] >= "5") total += 1n;
  const e = (total / escala).toString();
  let dec = maxDecimales === 0 ? "" : (total % escala).toString().padStart(maxDecimales, "0");
  while (dec.length > minDecimales && dec.endsWith("0")) dec = dec.slice(0, -1);
  return `${negativo && total !== 0n ? "-" : ""}${agrupar(e)}${dec ? SEP_DECIMAL + dec : ""}`;
}

/** Unidades mínimas (wei, 18 decimales) → string decimal. */
export function unidadesADecimal(unidades: string, decimales = 18): string {
  if (!/^\d+$/.test(unidades)) throw new Error(`Unidades inválidas: ${unidades}`);
  const s = unidades.padStart(decimales + 1, "0");
  const ent = s.slice(0, s.length - decimales);
  const frac = s.slice(s.length - decimales).replace(/0+$/, "");
  return frac ? `${ent}.${frac}` : ent;
}

/** Multiplica dos decimales (strings) sin usar `number`. Devuelve un string decimal. */
export function multiplicarDecimales(a: string, b: string): string {
  const pa = partirDecimal(a);
  const pb = partirDecimal(b);
  const prod = BigInt(pa.enteros + pa.fraccion) * BigInt(pb.enteros + pb.fraccion);
  const escala = pa.fraccion.length + pb.fraccion.length;
  const s = prod.toString().padStart(escala + 1, "0");
  const ent = s.slice(0, s.length - escala);
  const frac = s.slice(s.length - escala).replace(/0+$/, "");
  const signo = pa.negativo !== pb.negativo && prod !== 0n ? "-" : "";
  return `${signo}${ent}${frac ? "." + frac : ""}`;
}

/** "2027-01-05" o ISO completo → "5/1/2027" (sin pasar por Date: no hay corrimientos por zona horaria). */
export function formatFecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`Fecha inválida: ${iso}`);
  return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
}

/** Basis points → porcentaje: 2600 → "26 %", 1180 → "11,8 %". */
export function formatBps(bps: number): string {
  const entero = Math.trunc(bps / 100);
  const resto = Math.abs(bps % 100);
  let dec = resto.toString().padStart(2, "0").replace(/0+$/, "");
  dec = dec ? SEP_DECIMAL + dec : "";
  return `${entero}${dec} %`;
}

/** "0x" + 64 hex → "0x9f3a…c41e". */
export function hashCorto(hash: string, largo = 4): string {
  return hash.length <= 2 + largo * 2 ? hash : `${hash.slice(0, 2 + largo)}…${hash.slice(-largo)}`;
}

export const ETIQUETA_ESTADO: Record<EstadoCheque, string> = {
  Pending: "Pendiente",
  Funded: "Fondeado",
  Paid: "Pagado",
  Rejected: "Rechazado",
};

// Clases Tailwind por estado: color + texto (el color nunca es la única señal).
export const CLASES_ESTADO: Record<EstadoCheque, string> = {
  Pending: "bg-estado-pendiente-bg text-estado-pendiente-tx",
  Funded: "bg-estado-fondeado-bg text-estado-fondeado-tx",
  Paid: "bg-estado-pagado-bg text-estado-pagado-tx",
  Rejected: "bg-estado-rechazado-bg text-estado-rechazado-tx",
};

export const DESCRIPCION_BANDA: Record<Banda, string> = {
  A: "Riesgo bajo",
  B: "Riesgo moderado",
  C: "Riesgo alto",
  D: "No se compra",
};

const BASESCAN = "https://sepolia.basescan.org";
export const urlTx = (hash: string) => `${BASESCAN}/tx/${hash}`;
export const urlDireccionSepolia = (dir: string) => `${BASESCAN}/address/${dir}`;
export const urlDireccionMainnet = (dir: string) => `https://basescan.org/address/${dir}`;

/** Suma decimales (strings) sin usar `number`. Los valores no pueden ser negativos. */
export function sumarDecimales(a: string, b: string): string {
  const pa = partirDecimal(a);
  const pb = partirDecimal(b);
  if (pa.negativo || pb.negativo) throw new Error("sumarDecimales no admite negativos");
  const escala = Math.max(pa.fraccion.length, pb.fraccion.length);
  const aE = BigInt(pa.enteros + pa.fraccion.padEnd(escala, "0"));
  const bE = BigInt(pb.enteros + pb.fraccion.padEnd(escala, "0"));
  const s = (aE + bE).toString().padStart(escala + 1, "0");
  const ent = s.slice(0, s.length - escala);
  const frac = s.slice(s.length - escala).replace(/0+$/, "");
  return `${ent}${frac ? "." + frac : ""}`;
}

/** a − b como decimal con signo (puede dar negativo). */
export function restarDecimales(a: string, b: string): string {
  const pa = partirDecimal(a);
  const pb = partirDecimal(b);
  if (pa.negativo || pb.negativo) throw new Error("restarDecimales no admite negativos");
  const escala = Math.max(pa.fraccion.length, pb.fraccion.length);
  const aE = BigInt(pa.enteros + pa.fraccion.padEnd(escala, "0"));
  const bE = BigInt(pb.enteros + pb.fraccion.padEnd(escala, "0"));
  const d = aE - bE;
  const neg = d < 0n;
  const s = (neg ? -d : d).toString().padStart(escala + 1, "0");
  const ent = s.slice(0, s.length - escala);
  const frac = s.slice(s.length - escala).replace(/0+$/, "");
  return `${neg ? "-" : ""}${ent}${frac ? "." + frac : ""}`;
}

/** Decimal no negativo → bigint escalado a `decimales` (trunca). Sirve para comparar y repartir sin `number`. */
export function escalarDecimal(valor: string, decimales = 6): bigint {
  const p = partirDecimal(valor);
  if (p.negativo) throw new Error("escalarDecimal no admite negativos");
  return BigInt(p.enteros + p.fraccion.padEnd(decimales, "0").slice(0, decimales));
}

/** Compara dos decimales no negativos: −1, 0 o 1. */
export function compararDecimales(a: string, b: string): -1 | 0 | 1 {
  const x = escalarDecimal(a, 18);
  const y = escalarDecimal(b, 18);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** a ÷ b con `decimales` decimales (trunca). Sin `number`. Divisor cero → error. */
export function dividirDecimales(a: string, b: string, decimales = 6): string {
  const pa = partirDecimal(a);
  const pb = partirDecimal(b);
  if (pa.negativo || pb.negativo) throw new Error("dividirDecimales no admite negativos");
  const den = BigInt(pb.enteros + pb.fraccion) * 10n ** BigInt(pa.fraccion.length);
  if (den === 0n) throw new Error("División por cero");
  const num = BigInt(pa.enteros + pa.fraccion) * 10n ** BigInt(decimales + pb.fraccion.length);
  const q = (num / den).toString().padStart(decimales + 1, "0");
  const ent = q.slice(0, q.length - decimales);
  const frac = q.slice(q.length - decimales).replace(/0+$/, "");
  return frac ? `${ent}.${frac}` : ent;
}

/** Permilles (0–1000) → "12,3 %". Las tortas reparten a un decimal para que sumen 100 %. */
export const formatPermil = (permil: number): string => formatBps(permil * 10);

// ---------- Fechas y horas de Buenos Aires (UTC−3, sin horario de verano) ----------

const OFFSET_BA_MS = -3 * 60 * 60 * 1000;
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export interface PartesBA {
  anio: number;
  mes: number;
  dia: number;
  diaSemana: number; // 0 domingo … 6 sábado
  hora: number;
  minuto: number;
}

/** Descompone un instante en fecha y hora de Buenos Aires. */
export function partesBA(d: Date): PartesBA {
  const t = new Date(d.getTime() + OFFSET_BA_MS);
  return { anio: t.getUTCFullYear(), mes: t.getUTCMonth() + 1, dia: t.getUTCDate(), diaSemana: t.getUTCDay(), hora: t.getUTCHours(), minuto: t.getUTCMinutes() };
}

/** ISO → "lunes 9/11/2026" (hora de Buenos Aires); si no es medianoche agrega ", 15:30 hs". */
export function formatFechaLiquidacion(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha inválida: ${iso}`);
  const p = partesBA(d);
  const hora = p.hora === 0 && p.minuto === 0 ? "" : `, ${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")} hs`;
  return `${DIAS_SEMANA[p.diaSemana]} ${p.dia}/${p.mes}/${p.anio}${hora}`;
}
