// "Sesión rápida": el informe del activo se guarda también en el sessionStorage de quien hizo el análisis.
// Todo el acceso va con try/catch: el almacenamiento puede no existir, estar lleno o bloqueado.
import { esInformeCheque, type InformeActivo } from "./agent/informe";

export type AlmacenLocal = Pick<Storage, "getItem" | "setItem">;

const PREFIJO = "fc_informe:";
const clave = (id: string) => `${PREFIJO}${id.toLowerCase()}`;

function almacenDelNavegador(): AlmacenLocal | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Guarda el informe bajo el id del activo. Devuelve false si no se pudo (no es un error para el usuario). */
export function guardarInformeLocal(informe: InformeActivo, almacen: AlmacenLocal | null = almacenDelNavegador()): boolean {
  try {
    if (!almacen) return false;
    almacen.setItem(clave(informe.cotizacion.id), JSON.stringify(informe));
    return true;
  } catch {
    return false;
  }
}

/**
 * Devuelve el informe guardado solo si es del mismo activo (`cotizacion.id`) y su `cotizacionHash` es el registrado on-chain.
 * Sin hash on-chain para comparar no se acepta nada.
 */
export function leerInformeLocal(id: string, cotizacionHashOnchain: string | null, almacen: AlmacenLocal | null = almacenDelNavegador()): InformeActivo | null {
  try {
    if (!almacen || !cotizacionHashOnchain) return null;
    const crudo = almacen.getItem(clave(id));
    if (!crudo) return null;
    const x: unknown = JSON.parse(crudo);
    if (!esInformeCheque(x)) return null;
    if (x.cotizacion.id.toLowerCase() !== id.toLowerCase()) return null;
    if (x.cotizacion.cotizacionHash.toLowerCase() !== cotizacionHashOnchain.toLowerCase()) return null;
    return x;
  } catch {
    return null;
  }
}
