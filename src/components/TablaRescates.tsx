import type { EstadoRescate, RescateVista } from "@/shared/types";
import { formatDecimal, formatFecha, formatFechaLiquidacion, formatPesos } from "@/lib/format";
import { ETIQUETA_RESCATE } from "@/lib/rescates";

const CLASES: Record<EstadoRescate, string> = {
  Pendiente: "bg-estado-pendiente-bg text-estado-pendiente-tx",
  Liquidado: "bg-estado-pagado-bg text-estado-pagado-tx",
  Cancelado: "bg-panel-2 text-suave",
};

/** Rescates con su estado y la fecha desde la que se pueden liquidar (hora de Buenos Aires). */
export function TablaRescates({ rescates, vacio = "Todavía no hay rescates." }: { rescates: RescateVista[]; vacio?: string }) {
  if (rescates.length === 0) return <p className="text-sm text-suave">{vacio}</p>;
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <caption className="sr-only">Rescates de cuotapartes</caption>
      <thead>
        <tr className="border-b border-linea text-left text-xs text-suave">
          <th scope="col" className="py-2 pr-2 font-medium">Cuotapartes</th>
          <th scope="col" className="px-2 font-medium">Se liquida desde</th>
          <th scope="col" className="w-[28%] pl-2 text-right font-medium">Estado</th>
        </tr>
      </thead>
      <tbody>
        {rescates.map((r) => (
          <tr key={r.id} className="border-b border-linea align-top">
            <td className="py-3 pr-2 tabular-nums">
              {formatDecimal(r.cuotapartes, 6)}
              <span className="block text-xs text-suave">Pedido el {formatFecha(r.solicitadoEn)}</span>
            </td>
            <td className="px-2 py-3">
              {formatFechaLiquidacion(r.liquidableDesde)}
              {r.monto !== null && <span className="block text-xs text-suave">Pagado: {formatPesos(r.monto)}</span>}
            </td>
            <td className="py-3 pl-2 text-right">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASES[r.estado]}`}>{ETIQUETA_RESCATE[r.estado]}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
