// Lógica de presentación de /invertir. Sin React.
import type { CuentaDemo, CuentaDemoEstado } from "@/shared/types";
import { dividirDecimales, formatDecimal, formatPesos, multiplicarDecimales, restarDecimales, sumarDecimales } from "./format";

/** Valor inicial de la cuotaparte (V2-SPEC): se usa si el fondo todavía no informa uno. */
export const PRECIO_INICIAL_CUOTAPARTE = "1000";

/** Simulador: con `monto` pesos y el valor de cuotaparte vigente, cuántas cuotapartes recibís (6 decimales, trunca). */
export function cuotapartesPorMonto(monto: string, valorCuotaparte: string): string {
  const valor = valorCuotaparte === "0" || valorCuotaparte === "" ? PRECIO_INICIAL_CUOTAPARTE : valorCuotaparte;
  return dividirDecimales(monto, valor, 6);
}

/** Lote de negociación (Facu, 7-11-2026): se suscribe a mínimo 1.000 cuotapartes enteras y de a 1. */
export const MIN_CUOTAPARTES = "1000";

export const CUENTAS: { id: CuentaDemo; nombre: string }[] = [
  { id: "inversor1", nombre: "Inversor 1" },
  { id: "inversor2", nombre: "Inversor 2" },
];

/** Costo estimado en pesos de suscribir `cuotapartes` enteras al valor de cuotaparte vigente (sin number). */
export function costoEstimado(cuotapartes: string, valorCuotaparte: string): string {
  const valor = valorCuotaparte === "0" || valorCuotaparte === "" ? PRECIO_INICIAL_CUOTAPARTE : valorCuotaparte;
  return multiplicarDecimales(cuotapartes, valor);
}

/**
 * Cuotapartes a suscribir tal como se escriben en es-AR (punto de miles: "1.000"). Tienen que ser enteras (de a 1)
 * y al menos `minimo`. Devuelve el entero como string o un mensaje claro.
 */
export function validarCuotapartesSuscripcion(entrada: string, valorCuotaparte: string, minimo = MIN_CUOTAPARTES): { cuotapartes: string } | { error: string } {
  const texto = entrada.trim().replace(/\s/g, "");
  if (!texto) return { error: "Ingresá cuántas cuotapartes querés suscribir." };
  if (texto.includes(",") || (texto.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(texto))) {
    return { error: "Las cuotapartes se suscriben enteras, de a 1 (sin decimales)." };
  }
  const limpio = texto.replace(/\./g, "");
  if (!/^\d+$/.test(limpio)) return { error: "Usá solo números enteros." };
  const cuotapartes = limpio.replace(/^0+(?=\d)/, "");
  if (BigInt(cuotapartes) < BigInt(minimo)) {
    return { error: `La suscripción mínima es de ${formatDecimal(minimo)} cuotapartes (≈ ${formatPesos(costoEstimado(minimo, valorCuotaparte))} al valor de hoy).` };
  }
  return { cuotapartes };
}

export interface Deposito {
  monto: string; // pesos
  shares: string;
  tx: string;
}

/** Estado de una cuenta de demo, solo de esta sesión (la API no expone saldos todavía). */
export interface PosicionCuenta {
  kyc: boolean;
  depositos: Deposito[];
}

export const POSICION_VACIA: PosicionCuenta = { kyc: false, depositos: [] };

export function totalInvertido(p: PosicionCuenta): string {
  return p.depositos.reduce((acc, d) => sumarDecimales(acc, d.monto), "0");
}

export function totalCuotapartes(p: PosicionCuenta): string {
  return p.depositos.reduce((acc, d) => sumarDecimales(acc, d.shares), "0");
}

export interface ValorPosicion {
  cuotapartes: string;
  invertido: string;
  valorActual: string;
  variacion: string; // valorActual − invertido, con signo
}

export function valorPosicion(p: PosicionCuenta, valorCuotaparte: string): ValorPosicion {
  const cuotapartes = totalCuotapartes(p);
  const invertido = totalInvertido(p);
  const valorActual = multiplicarDecimales(cuotapartes, valorCuotaparte);
  return { cuotapartes, invertido, valorActual, variacion: restarDecimales(valorActual, invertido) };
}

export function validarMontoInversion(entrada: string): { monto: string } | { error: string } {
  const monto = entrada.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!monto || monto === "0") return { error: "Ingresá cuántos pesos querés invertir." };
  return { monto };
}

/** Clave de sessionStorage para recordar la posición de cada cuenta entre pantallas. */
export const claveStorage = (c: CuentaDemo) => `fondo-cheques:posicion:${c}`;

export function leerPosicion(texto: string | null): PosicionCuenta {
  if (!texto) return POSICION_VACIA;
  try {
    const x: unknown = JSON.parse(texto);
    if (typeof x !== "object" || x === null) return POSICION_VACIA;
    const o = x as { kyc?: unknown; depositos?: unknown };
    const depositos = Array.isArray(o.depositos)
      ? o.depositos.filter(
          (d): d is Deposito =>
            typeof d === "object" && d !== null &&
            typeof (d as Deposito).monto === "string" && /^\d+(\.\d+)?$/.test((d as Deposito).monto) &&
            typeof (d as Deposito).shares === "string" && /^\d+(\.\d+)?$/.test((d as Deposito).shares) &&
            typeof (d as Deposito).tx === "string",
        )
      : [];
    return { kyc: o.kyc === true, depositos };
  } catch {
    return POSICION_VACIA;
  }
}

/**
 * ¿La cuenta ya tiene KYC? Vale lo que diga la cadena (`/api/demo/cuentas`) o lo aprobado en esta sesión.
 * Sin esto, en producción (sin clave de admin) un inversor con KYC aparecía "Pendiente" y no podía invertir.
 */
export function kycAprobado(cuenta: CuentaDemo, enSesion: boolean, cuentas: CuentaDemoEstado[] | undefined): boolean {
  return enSesion || cuentas?.find((c) => c.id === cuenta)?.kyc === true;
}
