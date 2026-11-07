// Lógica de presentación de /pyme: validación del formulario y mensajes de error. Sin React.
import { TIPOS_GARANTIA, type GarantiaInput, type TipoActivo, type TipoGarantia } from "@/shared/types";
import type { EntradaCotizacion } from "./agent-client";
import { NOMBRE_EMISOR } from "./cotizacion";

export interface ValoresFormulario {
  cuit: string;
  monto: string;
  vencimiento: string; // AAAA-MM-DD (input type="date")
  tipo?: TipoActivo; // por defecto 'cheque'
  garantia?: ValoresGarantia; // solo si el vendedor ofrece prenda
  balance?: string; // texto pegado o leído de un .txt/.csv
}

export interface ValoresGarantia {
  tipo: TipoGarantia;
  descripcion: string;
  valorDeclarado: string;
  documentos: string[];
}

export type ErroresFormulario = Partial<Record<"cuit" | "monto" | "vencimiento" | "garantiaTipo" | "garantiaDescripcion" | "garantiaValor" | "garantiaDocumentos" | "balance", string>>;

export const LIMITE_BALANCE_BYTES = 100_000;
export const MAX_DOCUMENTOS = 10;
export const MAX_LARGO_DOCUMENTO = 120;

/** Tipos que se pueden elegir: "ninguna" no es una garantía, es la ausencia (se maneja con el interruptor). */
export const TIPOS_GARANTIA_ELEGIBLES: TipoGarantia[] = TIPOS_GARANTIA.filter((t) => t !== "ninguna");

/** Deja solo dígitos: acepta "30-70308853-4", "30 70308853 4", etc. */
export const normalizarCuit = (v: string): string => v.replace(/\D/g, "");

/** Pesos enteros: acepta "10.000.000", "$ 10000000". Devuelve solo dígitos. */
export const normalizarMonto = (v: string): string => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

/** Dígito verificador del CUIT/CUIL (módulo 11). */
export function cuitValido(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(cuit[i]), 0);
  const resto = suma % 11;
  const esperado = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return esperado === Number(cuit[10]);
}

/** Limpia la lista de documentos: sin vacíos ni repetidos, con largo y cantidad acotados. */
export function normalizarDocumentos(docs: string[]): string[] {
  const vistos = new Set<string>();
  const r: string[] = [];
  for (const d of docs) {
    const t = d.trim().slice(0, MAX_LARGO_DOCUMENTO);
    if (t && !vistos.has(t.toLowerCase())) {
      vistos.add(t.toLowerCase());
      r.push(t);
    }
  }
  return r.slice(0, MAX_DOCUMENTOS);
}

/** Texto del balance: acepta hasta LIMITE_BALANCE_BYTES (UTF-8). Vacío es válido (el balance es opcional). */
export function validarBalance(texto: string): string | undefined {
  const bytes = new TextEncoder().encode(texto).length;
  if (bytes > LIMITE_BALANCE_BYTES) return `El balance pesa ${Math.ceil(bytes / 1000)} KB y el máximo es ${LIMITE_BALANCE_BYTES / 1000} KB. Pegá solo las partes principales.`;
  return undefined;
}

/** ¿Se puede leer este archivo como balance? Solo .txt o .csv y hasta el límite. */
export function validarArchivoBalance(nombre: string, bytes: number): string | undefined {
  if (!/\.(txt|csv)$/i.test(nombre)) return "El archivo tiene que ser .txt o .csv.";
  if (bytes > LIMITE_BALANCE_BYTES) return `El archivo pesa ${Math.ceil(bytes / 1000)} KB y el máximo es ${LIMITE_BALANCE_BYTES / 1000} KB.`;
  return undefined;
}

/** `hoy` en AAAA-MM-DD (se recibe por parámetro para poder testear). */
export function validarFormulario(v: ValoresFormulario, hoy: string): ErroresFormulario {
  const e: ErroresFormulario = {};
  const quien = NOMBRE_EMISOR[v.tipo ?? "cheque"];
  const instrumento = (v.tipo ?? "cheque") === "pagare" ? "pagaré" : "cheque";
  const cuit = normalizarCuit(v.cuit);
  if (!cuit) e.cuit = `Ingresá el CUIT del ${quien}.`;
  else if (!cuitValido(cuit)) e.cuit = "Revisá el CUIT: tiene que tener 11 dígitos y un verificador válido.";

  const monto = normalizarMonto(v.monto);
  if (!monto || monto === "0") e.monto = `Ingresá el monto del ${instrumento} en pesos.`;

  if (!v.vencimiento) e.vencimiento = "Elegí la fecha de vencimiento.";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(v.vencimiento)) e.vencimiento = "La fecha no es válida.";
  else if (v.vencimiento <= hoy) e.vencimiento = "El vencimiento tiene que ser posterior a hoy.";

  const g = v.garantia;
  if (g) {
    if (!TIPOS_GARANTIA_ELEGIBLES.includes(g.tipo)) e.garantiaTipo = "Elegí qué tipo de garantía ofrecés.";
    if (!g.descripcion.trim()) e.garantiaDescripcion = "Describí la garantía (por ejemplo, marca, modelo y dominio).";
    const valor = normalizarMonto(g.valorDeclarado);
    if (!valor || valor === "0") e.garantiaValor = "Ingresá el valor declarado en pesos.";
  }
  if (v.balance) {
    const b = validarBalance(v.balance);
    if (b) e.balance = b;
  }
  return e;
}

/** Arma el body de /api/agente/analizar: solo manda lo que el vendedor completó. */
export function armarEntrada(v: ValoresFormulario): EntradaCotizacion {
  const entrada: EntradaCotizacion = { cuit: normalizarCuit(v.cuit), nominal: normalizarMonto(v.monto), vencimiento: v.vencimiento, tipo: v.tipo ?? "cheque" };
  if (v.garantia) {
    const docs = normalizarDocumentos(v.garantia.documentos);
    const garantia: GarantiaInput = { tipo: v.garantia.tipo, descripcion: v.garantia.descripcion.trim(), valorDeclarado: normalizarMonto(v.garantia.valorDeclarado) };
    if (docs.length > 0) garantia.documentos = docs;
    entrada.garantia = garantia;
  }
  const balance = v.balance?.trim();
  if (balance) entrada.balance = balance;
  return entrada;
}

/** Fecha local de hoy en AAAA-MM-DD. */
export function hoyISO(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface ExplicacionError {
  titulo: string;
  detalle: string;
}

/** Traduce los códigos de error del fondeo a algo que entienda quien mira la demo. */
export function explicarErrorFondeo(codigo: string, mensaje: string): ExplicacionError {
  const cola = "La regla está dentro del contrato, así que ni el backend ni nadie del equipo puede saltearla. El activo queda registrado como pendiente.";
  if (codigo === "CONCENTRACION_EXCEDIDA") {
    return {
      titulo: "El contrato no dejó comprar este activo",
      detalle: `Ese emisor ya concentra el máximo que permite el fondo: 10 % del patrimonio. ${cola}`,
    };
  }
  if (codigo === "INDUSTRIA_EXCEDIDA") {
    return {
      titulo: "El contrato no dejó comprar este activo",
      detalle: `Esa industria ya concentra el máximo que permite el fondo: 25 % del patrimonio. ${cola}`,
    };
  }
  if (codigo === "LIQUIDEZ_MINIMA" || codigo === "LIQUIDEZ_MINIMA_INSUFICIENTE") {
    return {
      titulo: "La compra dejaría al fondo sin su reserva de liquidez",
      detalle: `El fondo tiene que mantener al menos 15 % del patrimonio en liquidez. ${cola}`,
    };
  }
  if (codigo === "SIN_LIQUIDEZ") {
    return {
      titulo: "El fondo no tiene liquidez suficiente",
      detalle: "No hay saldo disponible para adelantar este activo. Cuando entren más inversores, se puede fondear. Queda registrado como pendiente.",
    };
  }
  return { titulo: "No pudimos fondear el activo", detalle: mensaje };
}

export function etiquetaFuente(f: "bcra-live" | "bcra-cache"): string {
  return f === "bcra-live" ? "BCRA, consulta en vivo" : "BCRA, copia guardada";
}

/** Paso del asistente de /pyme: 1 datos, 2 cotización, 3 estado del cheque. */
export function pasoDeFase(tipo: string): 1 | 2 | 3 {
  if (tipo === "form") return 1;
  if (tipo === "cotizando" || tipo === "cotizado") return 2;
  return 3;
}
