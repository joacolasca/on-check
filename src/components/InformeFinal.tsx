"use client";
import { useState } from "react";
import { formatBps, formatPesos, hashCorto, urlTx } from "@/lib/format";
import { resumenCopiable, type FotoFondo, type InformeVista } from "@/lib/mandato-ui";
import { Boton, LinkBaseScan, Tarjeta } from "./ui";

function Antes({ etiqueta, antes, despues }: { etiqueta: string; antes: string | null; despues: string | null }) {
  return (
    <div className="rounded-2xl border border-linea bg-panel-2 px-3 py-3">
      <div className="text-xs text-suave">{etiqueta}</div>
      <div className="mt-1 text-sm text-suave tabular-nums">Antes: {antes ?? "no disponible"}</div>
      <div className="text-lg font-semibold tabular-nums" aria-label={`${etiqueta} después ${despues ?? "no disponible"}`}>{despues ?? "—"}</div>
    </div>
  );
}

const fmt = {
  patrimonio: (f: FotoFondo | null) => (f ? formatPesos(f.patrimonio) : null),
  liquidez: (f: FotoFondo | null) => (f ? formatBps(f.liquidezBps) : null),
  cuota: (f: FotoFondo | null) => (f ? formatPesos(f.valorCuotaparte) : null),
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-linea pt-4">
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

/** Bloque 4: informe final con antes/después, compras, omisiones, rechazos, rebote y links. */
export function InformeFinal({ informe }: { informe: InformeVista }) {
  const [copia, setCopia] = useState<"no" | "ok" | "fallo">("no");
  async function copiar() {
    try {
      await navigator.clipboard.writeText(resumenCopiable(informe));
      setCopia("ok");
      setTimeout(() => setCopia("no"), 2000);
    } catch {
      setCopia("fallo");
    }
  }
  const i = informe;
  return (
    <Tarjeta titulo={i.revocado ? "Informe del mandato (revocado)" : "Informe del mandato"} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Antes etiqueta="Patrimonio del fondo" antes={fmt.patrimonio(i.antes)} despues={fmt.patrimonio(i.despues)} />
        <Antes etiqueta="Liquidez del fondo" antes={fmt.liquidez(i.antes)} despues={fmt.liquidez(i.despues)} />
        <Antes etiqueta="Valor de la cuotaparte" antes={fmt.cuota(i.antes)} despues={fmt.cuota(i.despues)} />
      </div>
      {(!i.antes || !i.despues) && <p className="text-xs text-suave">No pudimos leer el estado del fondo antes o después: la comparación queda incompleta.</p>}
      <p className="text-sm">
        Invertido <strong className="tabular-nums">{formatPesos(i.invertido)}</strong> de <span className="tabular-nums">{formatPesos(i.mandato.presupuesto)}</span> · disponible <span className="tabular-nums">{formatPesos(i.disponible)}</span>
      </p>

      <Seccion titulo={`Compras (${i.comprados.length})`}>
        {i.comprados.length === 0 ? <p className="text-sm text-suave">No compró nada.</p> : (
          <ul className="space-y-1 text-sm">
            {i.comprados.map((c) => (
              <li key={c.chequeId} className="flex flex-wrap justify-between gap-x-4">
                <span>{c.nombre}{c.estado === "Rejected" && <span className="ml-2 text-estado-rechazado-tx">rebotó (simulado)</span>}</span>
                <span className="tabular-nums text-suave">{formatPesos(c.precioCompra)} <LinkBaseScan href={urlTx(c.tx)}>{hashCorto(c.tx)} ↗</LinkBaseScan></span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo={`Omitidos (${i.omitidos.length})`}>
        {i.omitidos.length === 0 ? <p className="text-sm text-suave">No omitió ninguno.</p> : (
          <ul className="space-y-2 text-sm">
            {i.omitidos.map((o) => (
              <li key={o.activoId}>
                <strong>{o.nombre}</strong>
                {o.razones.length === 0 ? <span className="text-suave"> · lo omitiste vos</span> : o.razones.map((r) => <span key={r.regla} className="block text-suave">✗ {r.mensaje}</span>)}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {i.rechazadosPorContrato.length > 0 && (
        <Seccion titulo={`El contrato dijo que no (${i.rechazadosPorContrato.length})`}>
          <ul className="space-y-1 text-sm">
            {i.rechazadosPorContrato.map((r) => (
              <li key={r.activoId}><strong>{r.nombre}</strong> <span className="font-mono text-xs text-estado-rechazado-tx">{r.codigo}</span><span className="block text-suave">{r.mensaje}</span></li>
            ))}
          </ul>
        </Seccion>
      )}

      {i.rebotes.length > 0 && (
        <Seccion titulo="Rebote y replanificación (simulado en la demo)">
          <ul className="space-y-3 text-sm">
            {i.rebotes.map((r) => (
              <li key={r.chequeId}>
                <p><strong>{r.nombre}</strong> rebotó: pérdida <span className="tabular-nums">{formatPesos(r.perdida)}</span>. Emisor bloqueado: {r.emisorBloqueado}. <LinkBaseScan href={urlTx(r.tx)}>{hashCorto(r.tx)} ↗</LinkBaseScan></p>
                <p className="text-suave">{r.explicacion}</p>
                {r.replanificados.length > 0 && (
                  <ul className="mt-1 list-disc pl-5">
                    {r.replanificados.map((p) => <li key={p.activoId}>Volvió a evaluar {p.nombre}: {p.resultado}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {i.errores.length > 0 && (
        <Seccion titulo={`Sin procesar por un error (${i.errores.length})`}>
          <ul className="space-y-1 text-sm">{i.errores.map((e) => <li key={e.activoId}><strong>{e.nombre}</strong> <span className="text-suave">{e.mensaje}</span></li>)}</ul>
        </Seccion>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-linea pt-4">
        <Boton variante="primario" onClick={copiar}>{copia === "ok" ? "Copiado" : "Copiar resumen"}</Boton>
        <span role="status" className="text-xs text-suave">{copia === "fallo" ? "No pudimos copiar: abrí el texto de abajo y copialo a mano." : ""}</span>
      </div>
      {copia === "fallo" && <pre className="whitespace-pre-wrap rounded-ui border border-linea bg-panel-2 p-3 text-xs">{resumenCopiable(i)}</pre>}
    </Tarjeta>
  );
}

