// Informe final del mandato: función pura. La pantalla la llama con el estado, las evaluaciones, las ejecuciones, los rebotes y el
// resumen del fondo (GET /api/fondo) de antes y de después. No lee nada ni escribe nada.
import type { ActivoBandeja, EjecucionMandato, EstadoMandato, EvaluacionMandato, InformeMandato, ReboteMandato, ResumenFondo } from "@/shared/types";

export interface EntradaInforme {
  estado: EstadoMandato;
  evaluaciones: EvaluacionMandato[];
  ejecuciones: EjecucionMandato[];
  rebotes: ReboteMandato[];
  antes: ResumenFondo;
  despues: ResumenFondo;
  /** Para poner nombres a los activos (la evaluación solo trae el id). Opcional. */
  activos?: ActivoBandeja[];
  ahora?: Date;
}

const fondo = (r: ResumenFondo) => ({ patrimonio: r.totalAssets, liquidezBps: r.liquidezBps, valorCuotaparte: r.valorCuotaparte });

export function armarInforme({ estado, evaluaciones, ejecuciones, rebotes, antes, despues, activos = [], ahora = new Date() }: EntradaInforme): InformeMandato {
  const nombreDe = (activoId: string): string => {
    const delActivo = activos.find((a) => a.id === activoId)?.nombre;
    if (delActivo) return delActivo;
    const compra = estado.compras.find((c) => c.activoId === activoId);
    if (compra) return compra.nombre;
    const denominacion = evaluaciones.find((e) => e.activoId === activoId)?.cotizacion?.scoring?.denominacion;
    return denominacion ?? activoId;
  };

  // Si un activo se evaluó más de una vez (replanificación), vale la última evaluación.
  const ultima = new Map<string, EvaluacionMandato>();
  for (const e of evaluaciones) ultima.set(e.activoId, e);
  const comprados = new Set(estado.compras.map((c) => c.activoId));
  const rechazados = ejecuciones.filter((x) => x.rechazoContrato !== null);
  const idsRechazados = new Set(rechazados.map((x) => x.activoId));

  const omitidos = [...ultima.values()]
    .filter((e) => e.resultado !== "comprar" && !comprados.has(e.activoId))
    .map((e) => ({ activoId: e.activoId, nombre: nombreDe(e.activoId), razones: e.razones }));

  const rechazadosPorContrato = rechazados
    .filter((x, i) => rechazados.findIndex((y) => y.activoId === x.activoId) === i && !comprados.has(x.activoId))
    .map((x) => ({ activoId: x.activoId, nombre: nombreDe(x.activoId), codigo: x.rechazoContrato?.codigo ?? "", mensaje: x.rechazoContrato?.mensaje ?? "" }));

  const nombreDeHash = (hash: string): string => estado.compras.find((c) => c.libradorHash.toLowerCase() === hash.toLowerCase())?.nombre ?? hash;

  return {
    generadoEn: ahora.toISOString(),
    mandato: estado.mandato,
    antes: fondo(antes),
    despues: fondo(despues),
    comprados: estado.compras,
    // un activo que el contrato rechazó no es un "omitido": va en su propia lista
    omitidos: omitidos.filter((o) => !idsRechazados.has(o.activoId)),
    rechazadosPorContrato,
    rebotes: rebotes.map((r) => ({ chequeId: r.chequeId, nombre: r.emisorBloqueado, perdida: r.perdida })),
    emisoresBloqueados: estado.emisoresBloqueados.map(nombreDeHash),
    invertido: estado.invertido,
    disponible: estado.disponible,
  };
}
