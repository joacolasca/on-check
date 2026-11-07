// Validación de lo que llega a POST /api/agente/analizar (v2): tipo, garantía y balance, además de lo de siempre.
import { TIPOS_GARANTIA, type GarantiaInput, type TipoActivo, type TipoGarantia } from "@/shared/types";

export const MAX_DESCRIPCION_GARANTIA = 500;
export const MAX_DOCUMENTOS = 10;
export const MAX_LARGO_DOCUMENTO = 200;
export const MAX_BALANCE = 20_000;
const MAX_VALOR_DECLARADO = 20; // caracteres

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const esDecimalPositivo = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_VALOR_DECLARADO && /^\d+(\.\d+)?$/.test(v) && /[1-9]/.test(v);

export type Extras = { ok: true; tipo?: TipoActivo; garantia?: GarantiaInput; balance?: string } | { ok: false; mensaje: string };

/** Valida `tipo`, `garantia` y `balance` del cuerpo. Todo es opcional; lo que viene mal se rechaza con un mensaje claro. */
export function validarExtras(body: Record<string, unknown>): Extras {
  const r: { tipo?: TipoActivo; garantia?: GarantiaInput; balance?: string } = {};

  if (body.tipo !== undefined && body.tipo !== null) {
    if (body.tipo !== "cheque" && body.tipo !== "pagare") return { ok: false, mensaje: 'El tipo tiene que ser "cheque" o "pagare".' };
    r.tipo = body.tipo;
  }

  if (body.garantia !== undefined && body.garantia !== null) {
    const g = body.garantia;
    if (!esObjeto(g)) return { ok: false, mensaje: "La garantía tiene que ser un objeto." };
    if (typeof g.tipo !== "string" || !(TIPOS_GARANTIA as readonly string[]).includes(g.tipo)) {
      return { ok: false, mensaje: `El tipo de garantía tiene que ser uno de: ${TIPOS_GARANTIA.join(", ")}.` };
    }
    // "ninguna" equivale a no mandar garantía.
    if (g.tipo !== "ninguna") {
      const descripcion = typeof g.descripcion === "string" ? g.descripcion.trim() : "";
      if (!descripcion || descripcion.length > MAX_DESCRIPCION_GARANTIA) {
        return { ok: false, mensaje: `La descripción de la garantía es obligatoria y no puede pasar de ${MAX_DESCRIPCION_GARANTIA} caracteres.` };
      }
      if (!esDecimalPositivo(g.valorDeclarado)) return { ok: false, mensaje: "El valor declarado de la garantía tiene que ser un monto en pesos, como texto decimal (por ejemplo \"8000000\")." };
      let documentos: string[] | undefined;
      if (g.documentos !== undefined && g.documentos !== null) {
        if (!Array.isArray(g.documentos) || g.documentos.length > MAX_DOCUMENTOS || g.documentos.some((d) => typeof d !== "string" || d.length > MAX_LARGO_DOCUMENTO)) {
          return { ok: false, mensaje: `Los documentos tienen que ser una lista de hasta ${MAX_DOCUMENTOS} textos de hasta ${MAX_LARGO_DOCUMENTO} caracteres.` };
        }
        documentos = (g.documentos as string[]).map((d) => d.trim()).filter((d) => d !== "");
      }
      r.garantia = { tipo: g.tipo as TipoGarantia, descripcion, valorDeclarado: g.valorDeclarado, ...(documentos ? { documentos } : {}) };
    }
  }

  if (body.balance !== undefined && body.balance !== null) {
    if (typeof body.balance !== "string") return { ok: false, mensaje: "El balance tiene que ser texto." };
    if (body.balance.length > MAX_BALANCE) return { ok: false, mensaje: `El balance no puede pasar de ${MAX_BALANCE} caracteres.` };
    if (body.balance.trim()) r.balance = body.balance;
  }

  return { ok: true, ...r };
}
