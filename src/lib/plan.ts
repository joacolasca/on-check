// Plan automático del inversor: compras periódicas de cuotapartes (DCA) con precio máximo de compra y precio objetivo de venta.
// Funciones puras: deciden qué hace el agente en cada período con el valor de la cuotaparte de ese momento.
import { parseUnits } from "viem";

export type Frecuencia = "semanal" | "quincenal" | "mensual";

export interface ReglasPlan {
  cuotapartesPorCompra: string; // entero, mínimo 1.000 (mínimo del fondo)
  frecuencia: Frecuencia;
  precioMaxCompra: string; // pesos por cuotaparte, decimal
  precioVenta: string | null; // pesos por cuotaparte; null = nunca vende
  cuotapartesVenta: string; // entero; cuántas rescata cuando se alcanza el precio de venta
  periodos: number; // cuántos períodos corre la demo
}

export type Accion = "comprar" | "vender" | "esperar";

export interface Decision {
  accion: Accion;
  cuotapartes: string; // "0" si espera
  explicacion: string;
}

export const MINIMO_CUOTAPARTES = 1000n;
export const MAX_PERIODOS = 6;

export const REGLAS_POR_DEFECTO: ReglasPlan = {
  cuotapartesPorCompra: "1000",
  frecuencia: "semanal",
  precioMaxCompra: "1000",
  precioVenta: null,
  cuotapartesVenta: "1000",
  periodos: 4,
};

const DECIMAL = /^\d{1,9}(\.\d{1,2})?$/;
const ENTERO = /^\d{1,9}$/;

const wei = (pesos: string) => parseUnits(pesos, 18);
const miles = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const pesosTexto = (p: string) => {
  const [e, d] = p.split(".");
  return `$ ${miles(e)}${d ? `,${d.padEnd(2, "0").slice(0, 2)}` : ""}`;
};

/** Devuelve el primer error de las reglas, en castellano, o null si están bien. */
export function validarReglas(r: ReglasPlan): string | null {
  if (!ENTERO.test(r.cuotapartesPorCompra) || BigInt(r.cuotapartesPorCompra) < MINIMO_CUOTAPARTES) {
    return "Cada compra tiene que ser de al menos 1.000 cuotapartes, sin fracciones.";
  }
  if (!DECIMAL.test(r.precioMaxCompra) || wei(r.precioMaxCompra) <= 0n) return "El precio máximo de compra tiene que ser un monto mayor a cero.";
  if (r.precioVenta !== null) {
    if (!DECIMAL.test(r.precioVenta) || wei(r.precioVenta) <= 0n) return "El precio de venta tiene que ser un monto mayor a cero.";
    if (wei(r.precioVenta) <= wei(r.precioMaxCompra)) return "El precio de venta tiene que ser mayor al precio máximo de compra.";
    if (!ENTERO.test(r.cuotapartesVenta) || BigInt(r.cuotapartesVenta) <= 0n) return "Las cuotapartes a vender tienen que ser un entero mayor a cero.";
  }
  if (!Number.isInteger(r.periodos) || r.periodos < 1 || r.periodos > MAX_PERIODOS) return `Los períodos van de 1 a ${MAX_PERIODOS}.`;
  return null;
}

/** Qué hace el agente en un período, dado el valor de la cuotaparte y las cuotapartes que ya tiene el inversor. */
export function decidirPeriodo(r: ReglasPlan, valorCuotaparte: string, cuotapartesTenidas: string): Decision {
  const valor = wei(valorCuotaparte);
  const tenidas = wei(cuotapartesTenidas);
  const precio = pesosTexto(valorCuotaparte);
  if (r.precioVenta !== null && valor >= wei(r.precioVenta)) {
    const pedidas = wei(r.cuotapartesVenta);
    if (tenidas >= pedidas) {
      return {
        accion: "vender",
        cuotapartes: r.cuotapartesVenta,
        explicacion: `La cuotaparte vale ${precio} y tu precio de venta es ${pesosTexto(r.precioVenta)}: pido el rescate de ${miles(r.cuotapartesVenta)} cuotapartes. Se liquida a las 24 horas hábiles.`,
      };
    }
    return { accion: "esperar", cuotapartes: "0", explicacion: `La cuotaparte llegó a tu precio de venta (${precio}), pero todavía no tenés ${miles(r.cuotapartesVenta)} cuotapartes para vender.` };
  }
  if (valor <= wei(r.precioMaxCompra)) {
    return {
      accion: "comprar",
      cuotapartes: r.cuotapartesPorCompra,
      explicacion: `La cuotaparte vale ${precio}, dentro de tu máximo de ${pesosTexto(r.precioMaxCompra)}: compro ${miles(r.cuotapartesPorCompra)} cuotapartes.`,
    };
  }
  return { accion: "esperar", cuotapartes: "0", explicacion: `La cuotaparte vale ${precio}, por encima de tu máximo de ${pesosTexto(r.precioMaxCompra)}: este período no compro.` };
}

/** Etiqueta del período en el calendario de la demo (el tiempo se acelera: no se espera de verdad). */
export function etiquetaPeriodo(f: Frecuencia, n: number): string {
  return f === "semanal" ? `Semana ${n}` : f === "quincenal" ? `Quincena ${n}` : `Mes ${n}`;
}
