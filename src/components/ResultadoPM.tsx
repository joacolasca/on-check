import type { Cotizacion } from "@/shared/types";
import {
  AVISO_PRENDA,
  DESCRIPCION_DECISION,
  ETIQUETA_CONFIANZA,
  ETIQUETA_LIQUIDEZ_GARANTIA,
  NOMBRE_GARANTIA,
  ROTULO_MAV,
} from "@/lib/cotizacion";
import { formatBps, formatFecha, formatPesos } from "@/lib/format";
import { Fila } from "./ui";

const sub = "rounded-2xl border border-linea bg-panel-2 px-4 py-4";

export function DecisionGestor({ cot }: { cot: Cotizacion }) {
  const d = cot.decisionPM;
  if (!d) return null;
  const x = DESCRIPCION_DECISION[d.decision];
  return (
    <div className={sub}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-suave">Decisión del gestor</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${x.clases}`}>{x.titulo}</span>
      </div>
      <p className="mt-2 text-sm">{d.resumen}</p>
      {d.condiciones.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-suave">Condiciones</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {d.condiciones.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export function IndustriaEstimada({ cot }: { cot: Cotizacion }) {
  const i = cot.industria;
  return (
    <div className={sub}>
      <p className="text-xs text-suave">Industria · estimada por el agente</p>
      <p className="mt-1 flex flex-wrap items-center gap-2">
        <span className="font-medium">{i.nombre}</span>
        <span className="rounded-full border border-linea-fuerte px-2.5 py-0.5 text-xs">{ETIQUETA_CONFIANZA[i.confianza]}</span>
      </p>
      <p className="mt-2 text-sm text-suave">{i.fundamento}</p>
      {i.fuentes.length > 0 && <p className="mt-1 text-xs text-suave">Fuentes: {i.fuentes.join(", ")}</p>}
    </div>
  );
}

export function ConsultaMav({ cot }: { cot: Cotizacion }) {
  const m = cot.mav;
  if (!m) return null;
  return (
    <div className={sub}>
      <p className="text-xs text-suave">{ROTULO_MAV}</p>
      <dl className="mt-1 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-suave">Operaciones del emisor</dt><dd className="font-medium tabular-nums">{m.operaciones}</dd></div>
        <div><dt className="text-xs text-suave">Tasa promedio</dt><dd className="font-medium tabular-nums">{m.tasaPromedioTnaBps === null ? "—" : `${formatBps(m.tasaPromedioTnaBps)} TNA`}</dd></div>
        <div><dt className="text-xs text-suave">Plazo promedio</dt><dd className="font-medium tabular-nums">{m.plazoPromedioDias === null ? "—" : `${m.plazoPromedioDias} días`}</dd></div>
        <div><dt className="text-xs text-suave">Última operación</dt><dd className="font-medium tabular-nums">{m.ultimaOperacion ? formatFecha(m.ultimaOperacion) : "—"}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-suave">{m.nota}</p>
    </div>
  );
}

export function AnalisisGarantia({ cot }: { cot: Cotizacion }) {
  const g = cot.garantia;
  if (!g) return null;
  return (
    <div className={sub}>
      <p className="text-xs text-suave">Análisis de la garantía</p>
      <p className="mt-1 font-medium">{NOMBRE_GARANTIA[g.tipo]}</p>
      <p className="text-sm text-suave">{g.descripcion}</p>
      <div className="mt-2">
        <Fila etiqueta="Valor declarado" valor={formatPesos(g.valorDeclarado)} nota="Lo declaró el vendedor; el fondo no lo verificó" />
        <Fila etiqueta="Descuento aplicado" valor={formatBps(g.haircutBps)} nota="Supuesto del fondo, a validar" />
        <Fila etiqueta="Valor ajustado" valor={formatPesos(g.valorAjustado)} />
        <Fila etiqueta="Cobertura del nominal" valor={formatBps(g.coberturaBps)} />
        <Fila etiqueta="Liquidez" valor={ETIQUETA_LIQUIDEZ_GARANTIA[g.liquidez]} nota="Qué tan fácil es venderla si hay que ejecutar la prenda" />
      </div>
      {g.riesgos.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-suave">Riesgos</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{g.riesgos.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
      {g.documentosPendientes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-suave">Documentos pendientes</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{g.documentosPendientes.map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
      )}
      {g.observaciones && <p className="mt-3 text-sm text-suave">{g.observaciones}</p>}
      <p role="note" className="mt-3 rounded-xl border border-estado-pendiente-tx/40 bg-estado-pendiente-bg px-3 py-2 text-sm text-estado-pendiente-tx">{AVISO_PRENDA}</p>
    </div>
  );
}
