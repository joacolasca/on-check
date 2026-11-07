"use client";
import type { PasoAgente } from "@/lib/agent";
import { tituloHerramienta } from "@/lib/agente-titulos";
import { Tarjeta } from "./ui";

function Paso({ p }: { p: PasoAgente }) {
  const esConclusion = p.tipo === "conclusion";
  return (
    <li className={`rounded-2xl px-3 py-2 ${esConclusion ? "border border-linea bg-panel-2" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        {p.tipo === "herramienta" && (
          <span title={p.herramienta} className="rounded-full border border-linea-fuerte px-2 py-0.5 text-xs text-suave">{tituloHerramienta(p.herramienta ?? "")}</span>
        )}
        {p.tipo === "pensamiento" && <span className="text-xs text-suave">Pienso</span>}
        <span className={`text-sm ${esConclusion ? "font-semibold text-acento" : "font-medium"}`}>{p.titulo}</span>
      </div>
      {p.detalle && <p className="mt-1 text-sm text-suave">{p.detalle}</p>}
    </li>
  );
}

/** Solo la lista de pasos (sin tarjeta): la usan las tarjetas de /mandato. */
export function ListaPasos({ pasos }: { pasos: PasoAgente[] }) {
  return (
    <ol aria-live="polite" className="space-y-1">
      {pasos.map((p) => <Paso key={p.n} p={p} />)}
    </ol>
  );
}

/** Pasos del analista. Con `enVivo`, se van agregando a medida que el agente los produce. */
export function AnalisisAgente({ pasos, modo, enVivo = false }: { pasos: PasoAgente[]; modo?: "agente" | "determinista"; enVivo?: boolean }) {
  return (
    <Tarjeta titulo={enVivo ? "El analista está trabajando…" : "Cómo lo analizó el agente"}>
      <ol aria-live="polite" className="space-y-1">
        {pasos.map((p) => <Paso key={p.n} p={p} />)}
      </ol>
      {enVivo && (
        <p role="status" className="mt-2 flex items-center gap-2 px-3 text-sm text-suave">
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-acento" />
          {pasos.length === 0 ? "Conectando con el analista…" : "Sigue analizando…"}
        </p>
      )}
      {!enVivo && (
        <p className="mt-3 text-xs text-suave">
          {modo === "agente" ? "Análisis del agente con el scoring propio como herramienta." : "Análisis con el scoring propio del fondo."} Las reglas duras las hace cumplir el contrato.
        </p>
      )}
    </Tarjeta>
  );
}
