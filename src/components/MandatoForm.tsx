"use client";
import { useState } from "react";
import type { ActivoBandeja, Banda, Mandato, TipoActivo } from "@/shared/types";
import type { ErrorUi } from "@/lib/api-client";
import { formatPesos } from "@/lib/format";
import { EXPLICACION_REGLAS, mandatoDesdeValores, valoresDesdeMandato, type ErroresMandato, type ValoresMandato } from "@/lib/mandato-ui";
import { Boton, ErrorApiCaja, Tarjeta } from "./ui";

export const campo = "mt-1 w-full rounded-ui border border-linea-fuerte bg-fondo px-3 py-2.5 text-base text-texto placeholder:text-suave/60 focus:border-texto focus:outline-none";

function Regla(props: { id: string; titulo: string; ayuda: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-linea py-4 first:border-t-0 first:pt-0">
      <label htmlFor={props.id} className="text-sm font-medium">{props.titulo}</label>
      <p id={`${props.id}-ayuda`} className="mt-0.5 text-xs text-suave">{props.ayuda}</p>
      {props.children}
      {props.error && <p id={`${props.id}-error`} role="alert" className="mt-1 text-xs text-estado-rechazado-tx">{props.error}</p>}
    </div>
  );
}

const BANDAS: Banda[] = ["A", "B", "C"];
const TIPOS: { id: TipoActivo; texto: string }[] = [
  { id: "cheque", texto: "Cheques" },
  { id: "pagare", texto: "Pagarés" },
];

export function InterruptorRebote({ activo, onCambio, deshabilitado, compacto }: { activo: boolean; onCambio: (v: boolean) => void; deshabilitado?: boolean; compacto?: boolean }) {
  return (
    <label className={`flex items-start gap-3 text-sm ${deshabilitado ? "opacity-60" : ""}`}>
      <input type="checkbox" checked={activo} disabled={deshabilitado} onChange={(e) => onCambio(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--primario)]" />
      <span>
        Simular un rebote al final <span className="rounded-full border border-linea-fuerte px-2 py-0.5 text-xs text-suave">simulado · demo</span>
        {!compacto && <span className="block text-xs text-suave">Cuando termina la bandeja, el oráculo de la demo hace rebotar un cheque comprado y el agente replanifica.</span>}
      </span>
    </label>
  );
}

/** Bloque 1: las reglas del inversor, con los valores por defecto de la bandeja y un único botón. */
export function MandatoForm(props: {
  mandatoInicial: Mandato;
  activos: ActivoBandeja[];
  simularRebote: boolean;
  onSimularRebote: (v: boolean) => void;
  iniciando: boolean;
  error?: ErrorUi;
  onIniciar: (m: Mandato) => void;
}) {
  const [v, setV] = useState<ValoresMandato>(() => valoresDesdeMandato(props.mandatoInicial));
  const [errores, setErrores] = useState<ErroresMandato>({});
  const poner = (p: Partial<ValoresMandato>) => setV((x) => ({ ...x, ...p }));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const r = mandatoDesdeValores(v);
    if (!r.ok) return setErrores(r.errores);
    setErrores({});
    props.onIniciar(r.mandato);
  }
  const alternarTipo = (t: TipoActivo) => poner({ tipos: v.tipos.includes(t) ? v.tipos.filter((x) => x !== t) : [...v.tipos, t] });

  return (
    <Tarjeta titulo="1 · Tus reglas">
      <form onSubmit={enviar} noValidate>
        <Regla id="m-presupuesto" titulo="Presupuesto (pesos)" ayuda={EXPLICACION_REGLAS.presupuesto} error={errores.presupuesto}>
          <input id="m-presupuesto" inputMode="numeric" value={v.presupuesto} onChange={(e) => poner({ presupuesto: e.target.value })} aria-describedby="m-presupuesto-ayuda" aria-invalid={!!errores.presupuesto} className={campo} />
        </Regla>

        <div className="grid gap-x-6 sm:grid-cols-2">
          <Regla id="m-banda" titulo="Banda mínima" ayuda={EXPLICACION_REGLAS.banda}>
            <select id="m-banda" value={v.bandaMinima} onChange={(e) => poner({ bandaMinima: e.target.value as Banda })} className={campo}>
              {BANDAS.map((b) => <option key={b} value={b}>Banda {b}{b === "A" ? " (la mejor)" : ""}</option>)}
            </select>
          </Regla>
          <Regla id="m-tope" titulo="Tope por emisor (% del presupuesto)" ayuda={EXPLICACION_REGLAS.tope} error={errores.tope}>
            <input id="m-tope" inputMode="decimal" value={v.topePct} onChange={(e) => poner({ topePct: e.target.value })} aria-invalid={!!errores.tope} className={campo} />
          </Regla>
          <Regla id="m-plazo" titulo="Plazo máximo (días)" ayuda={EXPLICACION_REGLAS.plazo} error={errores.plazo}>
            <input id="m-plazo" inputMode="numeric" value={v.plazoMaxDias} onChange={(e) => poner({ plazoMaxDias: e.target.value })} aria-invalid={!!errores.plazo} className={campo} />
          </Regla>
          <Regla id="m-tipos" titulo="Instrumentos" ayuda={EXPLICACION_REGLAS.tipos} error={errores.tipos}>
            <div id="m-tipos" role="group" aria-label="Instrumentos" className="mt-2 flex gap-4">
              {TIPOS.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={v.tipos.includes(t.id)} onChange={() => alternarTipo(t.id)} className="h-4 w-4 accent-[var(--primario)]" />
                  {t.texto}
                </label>
              ))}
            </div>
          </Regla>
        </div>

        <Regla id="m-cobertura" titulo="Cobertura mínima de la garantía" ayuda={EXPLICACION_REGLAS.cobertura} error={errores.cobertura}>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.exigeCobertura} onChange={(e) => poner({ exigeCobertura: e.target.checked })} className="h-4 w-4 accent-[var(--primario)]" />
            Exigir cobertura mínima
          </label>
          {v.exigeCobertura && (
            <div className="mt-2 flex items-center gap-2">
              <input id="m-cobertura" inputMode="decimal" value={v.coberturaPct} onChange={(e) => poner({ coberturaPct: e.target.value })} aria-label="Cobertura mínima en porcentaje" aria-invalid={!!errores.cobertura} className={`${campo} !mt-0 max-w-32`} />
              <span className="text-sm text-suave">%</span>
            </div>
          )}
        </Regla>

        <Regla id="m-aprobacion" titulo="Aprobación humana (opcional)" ayuda={EXPLICACION_REGLAS.aprobacion} error={errores.aprobacion}>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.pideAprobacion} onChange={(e) => poner({ pideAprobacion: e.target.checked })} className="h-4 w-4 accent-[var(--primario)]" />
            Pedir mi aprobación por encima de un monto
          </label>
          {v.pideAprobacion && (
            <input id="m-aprobacion" inputMode="numeric" placeholder="Monto en pesos, por ejemplo 5.000.000" value={v.aprobacionSobre} onChange={(e) => poner({ aprobacionSobre: e.target.value })} aria-label="Monto a partir del cual pedir aprobación" aria-invalid={!!errores.aprobacion} className={campo} />
          )}
        </Regla>

        <div className="border-t border-linea pt-4">
          <InterruptorRebote activo={props.simularRebote} onCambio={props.onSimularRebote} />
        </div>

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-suave">Bandeja de hoy: {props.activos.length} activos para evaluar</summary>
          <ul className="mt-2 space-y-1">
            {props.activos.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-x-4 text-xs">
                <span>{a.nombre} · {a.tipo === "pagare" ? "pagaré" : "cheque"}{a.garantia ? " con garantía" : ""}</span>
                <span className="tabular-nums text-suave">{formatPesos(a.nominal)} · {a.dias} d</span>
              </li>
            ))}
          </ul>
        </details>

        {props.error && <div className="mt-4"><ErrorApiCaja error={props.error} /></div>}

        <div className="mt-5">
          <Boton type="submit" variante="primario" disabled={props.iniciando} className="w-full sm:w-auto">
            {props.iniciando ? "Iniciando…" : "Iniciar mandato"}
          </Boton>
          <p className="mt-2 text-xs text-suave">Una sola acción: después el agente recorre la bandeja solo. Podés pausar o revocar cuando quieras.</p>
        </div>
      </form>
    </Tarjeta>
  );
}
