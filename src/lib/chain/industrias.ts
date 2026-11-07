// Nombres de industria: salen de shared/industrias.json (el id es el uint8 del contrato).
import industrias from "../../../shared/industrias.json";

export const INDUSTRIAS: readonly { id: number; nombre: string }[] = industrias;
/** El contrato valida `industria <= 12`. */
export const INDUSTRIA_MAX_ID = Math.max(...INDUSTRIAS.map((i) => i.id));

export const nombreIndustria = (id: number): string => INDUSTRIAS.find((i) => i.id === id)?.nombre ?? `Industria ${id}`;
export const idIndustriaPorNombre = (nombre: string): number | undefined => INDUSTRIAS.find((i) => i.nombre === nombre)?.id;
