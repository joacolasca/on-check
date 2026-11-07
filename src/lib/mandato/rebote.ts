// Después de un rebote: qué activos vale la pena volver a evaluar, y la explicación en castellano. Puras.
import { formatPesos } from "@/lib/format";
import { aCentavos } from "@/lib/scoring/dinero";
import type { EstadoMandato, ReglaMandato } from "@/shared/types";

/** Lo mínimo que se necesita de una evaluación previa para replanificar (el cliente la manda; solo se leen estos campos). */
export interface EvaluacionPrevia {
  activoId: string;
  razones: { regla: ReglaMandato; cumple: boolean }[];
  libradorHash?: string;
  /** Precio de compra de su cotización (pesos): si se conoce, solo se replanifica lo que ahora entra en el disponible. */
  precioCompra?: string;
}

/**
 * Ids de la bandeja que habían quedado afuera SOLO por presupuesto o por tope del emisor, que no se compraron, cuyo emisor no quedó bloqueado
 * y que ahora entran en el presupuesto disponible (si se conoce su precio): vale la pena volver a pasarlos por el mandato. El mandato los vuelve a evaluar entero.
 */
export function activosParaReplanificar(estado: EstadoMandato, idsBandeja: string[], previas: EvaluacionPrevia[]): string[] {
  if (!/[1-9]/.test(estado.disponible)) return [];
  const bloqueados = new Set(estado.emisoresBloqueados.map((h) => h.toLowerCase()));
  const comprados = new Set(estado.compras.map((c) => c.activoId));
  // la última evaluación de cada activo es la que vale
  const ultimas = new Map<string, EvaluacionPrevia>();
  for (const p of previas) ultimas.set(p.activoId, p);
  const ids: string[] = [];
  for (const id of idsBandeja) {
    const p = ultimas.get(id);
    if (!p || comprados.has(id)) continue;
    const fallan = p.razones.filter((r) => !r.cumple).map((r) => r.regla);
    if (fallan.length === 0 || !fallan.every((r) => r === "presupuesto" || r === "tope_emisor")) continue;
    if (p.libradorHash && bloqueados.has(p.libradorHash.toLowerCase())) continue;
    if (p.precioCompra && aCentavos(p.precioCompra) > aCentavos(estado.disponible)) continue;
    ids.push(id);
  }
  return ids;
}

export function explicarRebote(args: { nombre: string; perdida: string; estado: EstadoMandato; replanificar: string[]; nombresReplan: string[] }): string {
  const { nombre, perdida, estado, replanificar, nombresReplan } = args;
  const plan =
    replanificar.length > 0
      ? `Vuelvo a evaluar ${replanificar.length === 1 ? "un activo que había quedado afuera" : `${replanificar.length} activos que habían quedado afuera`} por presupuesto o por tope de emisor (${nombresReplan.join(", ")}): ahora te quedan ${formatPesos(estado.disponible)} disponibles.`
      : `No hay activos omitidos por presupuesto o por tope de emisor para volver a evaluar; te quedan ${formatPesos(estado.disponible)} disponibles.`;
  return `Rebote simulado por el oráculo de la demo: el cheque de ${nombre} figura como rechazado y la pérdida es de ${formatPesos(perdida)}. Dejo de comprarle a ${nombre}; lo invertido baja a ${formatPesos(estado.invertido)}. ${plan}`;
}
