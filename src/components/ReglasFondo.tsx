import type { ResumenFondo } from "@/shared/types";
import { formatBps } from "@/lib/format";
import { consumosReglas, escalaBarra, reglasInformativas, type ConsumoRegla } from "@/lib/reglas";

function BarraLimite({ r }: { r: ConsumoRegla }) {
  const { rellenoPct, marcaPct } = escalaBarra(r.actualBps, r.limiteBps);
  return (
    <div
      className="relative mt-3 h-2.5 rounded-full bg-linea"
      role="progressbar"
      aria-label={`${r.nombre}: hoy ${formatBps(r.actualBps)}, ${r.tipo === "maximo" ? "tope" : "mínimo"} ${formatBps(r.limiteBps)}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.round(rellenoPct))}
    >
      <div className={`h-full rounded-full ${r.cumple ? "bg-acento" : "bg-estado-rechazado-tx"}`} style={{ width: `${Math.min(100, rellenoPct)}%` }} />
      <div aria-hidden className="absolute -top-1 h-4.5 w-0.5 rounded bg-texto" style={{ left: `${marcaPct}%` }} />
    </div>
  );
}

/** Bloque "Reglas del fondo": cada límite y cuánto se consume hoy. */
export function ReglasFondo({ fondo }: { fondo: ResumenFondo }) {
  const consumos = consumosReglas(fondo);
  const info = reglasInformativas(fondo, formatBps);
  return (
    <div className="space-y-4">
      <ul className="grid gap-3 md:grid-cols-3">
        {consumos.map((r) => (
          <li key={r.id} className="rounded-2xl border border-linea bg-panel-2 px-3 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{r.nombre}</span>
              <span className="text-xs text-suave">{r.tipo === "maximo" ? "tope" : "mínimo"} {formatBps(r.limiteBps)}</span>
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatBps(r.actualBps)}
              <span className="ml-2 text-sm font-normal text-suave">hoy</span>
            </p>
            <BarraLimite r={r} />
            <p className="mt-2 text-xs text-suave">{r.detalle}</p>
            <p className={`mt-1 text-xs font-medium ${r.cumple ? "text-estado-pagado-tx" : "text-estado-rechazado-tx"}`}>
              {r.cumple ? "Dentro de la regla" : "Fuera de la regla"}
            </p>
          </li>
        ))}
      </ul>
      <dl className="grid gap-3 md:grid-cols-3">
        {info.map((r) => (
          <div key={r.id} className="rounded-2xl border border-linea px-3 py-3">
            <dt className="text-xs text-suave">{r.nombre}</dt>
            <dd className="mt-1 text-sm font-semibold">{r.valor}</dd>
            <dd className="mt-1 text-xs text-suave">{r.detalle}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-suave">
        Los topes de emisor, industria y liquidez los hace cumplir el contrato: ni el backend ni el equipo pueden saltearlos. La liquidez representa una cuenta remunerada (simulada).
      </p>
    </div>
  );
}
