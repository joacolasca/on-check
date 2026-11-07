"use client";
import Link from "next/link";
import type { ItemCorrida, TonoResultado } from "@/lib/mandato-ui";
import { ETIQUETA_RESULTADO, resumenRazones, tituloRegla } from "@/lib/mandato-ui";
import { rutaDetalle } from "@/lib/detalle-vista";
import { formatPesos, hashCorto, urlTx } from "@/lib/format";
import { ListaPasos } from "./AnalisisAgente";
import { Boton, ErrorCaja, LinkBaseScan } from "./ui";

const CLASE_TONO: Record<TonoResultado, string> = {
  ok: "bg-estado-pagado-bg text-estado-pagado-tx",
  neutro: "bg-panel-2 text-suave border border-linea-fuerte",
  alerta: "bg-estado-pendiente-bg text-estado-pendiente-tx",
  error: "bg-estado-rechazado-bg text-estado-rechazado-tx",
};

function Etiqueta({ item, enTurno }: { item: ItemCorrida; enTurno: boolean }) {
  if (item.resultado) {
    const e = ETIQUETA_RESULTADO[item.resultado];
    return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASE_TONO[e.tono]}`}>{e.texto}</span>;
  }
  const texto = {
    pendiente: "En cola",
    analizando: "Analizando…",
    analizado: enTurno ? "Evaluando tu mandato…" : "Analizado, espera su turno",
    evaluado: "Decidido, falta ejecutar",
    ejecutando: "Comprando…",
    fin: "",
  }[item.etapa];
  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full border border-linea-fuerte px-2.5 py-0.5 text-xs text-suave">
      {(item.etapa === "analizando" || item.etapa === "ejecutando" || (item.etapa === "analizado" && enTurno)) && <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-acento" />}
      {texto}
    </span>
  );
}

function Razones({ item }: { item: ItemCorrida }) {
  const ev = item.evaluacion;
  if (!ev) return null;
  const r = resumenRazones(ev.razones);
  // Si todo cumple, la lista queda plegada (ya dice "cumple 9 de 9"); si algo falla, abierta: es lo que hay que leer.
  return (
    <details open={r.fallan.length > 0} className="mt-3">
      <summary className="cursor-pointer text-xs text-suave">
        Reglas de tu mandato: cumple {r.cumplen} de {r.total}
      </summary>
      <Link href="/politicas#reglas" className="mt-1 inline-block text-xs text-enlace underline-offset-2 hover:underline">Ver las reglas del fondo</Link>
      <ul className="mt-1 space-y-1">
        {ev.razones.map((x) => (
          <li key={x.regla} className="flex gap-2 text-sm">
            <span aria-label={x.cumple ? "Cumple" : "No cumple"} className={`w-4 shrink-0 text-center font-semibold ${x.cumple ? "text-estado-pagado-tx" : "text-estado-rechazado-tx"}`}>{x.cumple ? "✓" : "✗"}</span>
            <span className="min-w-0">
              <span className="font-medium">{tituloRegla(x.regla)}.</span> <span className="text-suave">{x.mensaje}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Veredicto({ item, onAprobar, onOmitir }: { item: ItemCorrida; onAprobar: () => void; onOmitir: () => void }) {
  const { resultado: r } = item;
  if (r === "compro" && item.compra) {
    const c = item.compra;
    return (
      <p className="mt-3 text-sm">
        Compró por <strong className="tabular-nums">{formatPesos(c.precioCompra)}</strong> <span className="text-suave">(nominal {formatPesos(c.nominal)})</span>{" "}
        <LinkBaseScan href={urlTx(c.tx)}>{hashCorto(c.tx)} ↗</LinkBaseScan>{" "}
        <Link href={rutaDetalle(c.chequeId)} className="text-enlace underline-offset-2 hover:underline">Ver detalle →</Link>
      </p>
    );
  }
  if (r === "contrato_no" && item.rechazoContrato) {
    return (
      <p role="status" className="mt-3 rounded-ui border border-estado-rechazado-tx/40 bg-estado-rechazado-bg px-3 py-2 text-sm text-estado-rechazado-tx">
        <span className="font-mono text-xs">{item.rechazoContrato.codigo}</span>
        <span className="block">{item.rechazoContrato.mensaje} Tu mandato lo permitía, pero las reglas del fondo las hace cumplir el contrato.</span>
      </p>
    );
  }
  if (r === "esperando_aprobacion") {
    return (
      <div role="alert" className="mt-3 rounded-ui border border-estado-pendiente-tx/40 bg-estado-pendiente-bg px-3 py-3 text-sm text-estado-pendiente-tx">
        <p>Este activo supera el monto que fijaste para pedirte aprobación. La corrida espera tu respuesta.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Boton variante="primario" onClick={onAprobar}>Aprobar y comprar</Boton>
          <Boton onClick={onOmitir}>Omitir</Boton>
        </div>
      </div>
    );
  }
  if (r === "error" && item.error) return <div className="mt-3"><ErrorCaja mensaje={item.error.mensaje} /></div>;
  return null;
}

/** Una tarjeta por activo de la corrida: pasos del agente, razones del mandato y resultado. */
export function TarjetaActivo({ item, enTurno = false, onAprobar, onOmitir }: { item: ItemCorrida; enTurno?: boolean; onAprobar: () => void; onOmitir: () => void }) {
  const a = item.activo;
  const resumenOmision =
    item.resultado === "omitio" && item.evaluacion ? resumenRazones(item.evaluacion.razones).fallan.map((r) => r.mensaje).join(" ") : null;
  return (
    <li aria-current={enTurno ? "step" : undefined} className={`rounded-2xl border bg-panel p-4 ${enTurno ? "border-acento shadow-[0_0_0_2px_var(--acento)]" : "border-linea"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            {item.compra?.nombre ?? a.nombre}
            {item.reevaluacion && <span className="ml-2 rounded-full border border-linea-fuerte px-2 py-0.5 text-xs font-normal text-suave">Reevaluado tras el rebote</span>}
          </h3>
          <p className="text-sm text-suave">
            {a.tipo === "pagare" ? "Pagaré" : "Cheque"} · <span className="tabular-nums">{formatPesos(a.nominal)}</span> · {a.dias} días{a.garantia ? " · con garantía" : ""}
          </p>
        </div>
        <Etiqueta item={item} enTurno={enTurno} />
      </div>

      {item.pasos.length > 0 && (
        <details open={item.etapa === "analizando" && enTurno} className="mt-3 rounded-2xl border border-linea bg-panel-2 px-3 py-2">
          <summary className="cursor-pointer text-sm text-suave">
            {item.etapa === "analizando" ? `Analizando… (${item.pasos.length} ${item.pasos.length === 1 ? "paso" : "pasos"} hasta ahora)` : `Cómo lo analizó el agente (${item.pasos.length} pasos)`}
          </summary>
          <div className="mt-2"><ListaPasos pasos={item.pasos} /></div>
        </details>
      )}
      {item.etapa === "analizando" && item.pasos.length === 0 && <p className="mt-3 text-sm text-suave">{enTurno ? "Conectando con el analista…" : "Analizando…"}</p>}

      <Razones item={item} />
      {resumenOmision && <p className="mt-3 text-sm"><strong>Omitió:</strong> <span className="text-suave">{resumenOmision}</span></p>}
      <Veredicto item={item} onAprobar={onAprobar} onOmitir={onOmitir} />
    </li>
  );
}
