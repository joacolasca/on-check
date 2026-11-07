"use client";
// Componentes base del estilo B (oscuro, terminal financiera). Solo presentación.
import { useState, type ReactNode } from "react";
import type { Banda, EstadoCheque } from "@/shared/types";
import { esErrorDeAcceso, type ErrorUi } from "@/lib/api-client";
import { CLASES_ESTADO, ETIQUETA_ESTADO, formatPesos } from "@/lib/format";

export function Tarjeta({ titulo, children, className = "" }: { titulo?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-linea bg-panel p-4 ${className}`}>
      {titulo && <h2 className="mb-3 text-sm font-semibold text-suave">{titulo}</h2>}
      {children}
    </section>
  );
}

export function Metrica({ etiqueta, valor, nota, extra, className = "" }: { etiqueta: string; valor: ReactNode; nota?: string; extra?: ReactNode; className?: string }) {
  return (
    <div className={`${className} rounded-2xl border border-linea bg-panel px-3 py-3`}>
      <div className="text-xs text-suave">{etiqueta}</div>
      <div className="mt-1 whitespace-nowrap text-lg font-semibold tabular-nums sm:text-xl">{valor}</div>
      {extra}
      {nota && <div className="mt-2 text-xs text-suave">{nota}</div>}
    </div>
  );
}

export function EstadoBadge({ estado }: { estado: EstadoCheque }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASES_ESTADO[estado]}`}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

export function BandaBadge({ banda }: { banda: Banda }) {
  return (
    <span className="inline-block rounded-full border border-linea-fuerte px-2.5 py-0.5 text-xs font-medium text-texto">
      Banda {banda}
    </span>
  );
}

export function Monto({ valor, className = "" }: { valor: string; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatPesos(valor)}</span>;
}

export function Cargando({ lineas = 3 }: { lineas?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="space-y-2">
      {Array.from({ length: lineas }, (_, i) => (
        <div key={i} className="h-5 animate-pulse rounded-ui bg-panel-2" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function ErrorCaja({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  return (
    <div role="alert" className="rounded-ui border border-estado-rechazado-tx/40 bg-estado-rechazado-bg px-3 py-3 text-sm text-estado-rechazado-tx">
      <p>{mensaje}</p>
      {onReintentar && (
        <button type="button" onClick={onReintentar} className="mt-2 rounded-full border border-current px-3 py-1 text-xs hover:bg-black/5">
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Error de una acción. Si falta la clave de la demo, explica qué hacer y ofrece el acceso. */
export function ErrorApiCaja({ error, onReintentar }: { error: ErrorUi; onReintentar?: () => void }) {
  if (!esErrorDeAcceso(error.codigo)) return <ErrorCaja mensaje={error.mensaje} onReintentar={onReintentar} />;
  return (
    <div role="alert" className="rounded-ui border border-linea-fuerte bg-panel-2 px-3 py-3 text-sm">
      <p className="font-medium">Esta acción es solo para el equipo de la demo</p>
      <p className="mt-1 text-suave">Para operar con las wallets de demo hace falta la clave del equipo. Ingresala una vez (dura 12 horas) y volvé a esta pantalla.</p>
      <a href="/api/demo/acceso" className="mt-3 inline-block rounded-full bg-primario px-4 py-2 text-xs font-medium text-sobre-primario hover:opacity-85">
        Ingresar la clave de la demo
      </a>
    </div>
  );
}

export function LinkBaseScan({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-mono text-enlace underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

export function Boton({
  children,
  variante = "secundario",
  ...props
}: { variante?: "primario" | "secundario" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "rounded-full px-5 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";
  const estilo =
    variante === "primario"
      ? "bg-primario text-sobre-primario hover:opacity-85"
      : "border border-linea-fuerte text-texto hover:bg-panel-2";
  return (
    <button type="button" {...props} className={`${base} ${estilo} ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

/** Fila de detalle: etiqueta a la izquierda, valor a la derecha (como en las pantallas de confirmación de una wallet). */
export function Fila({ etiqueta, valor, nota }: { etiqueta: string; valor: ReactNode; nota?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-linea py-3 first:border-t-0">
      <div>
        <div className="text-sm text-suave">{etiqueta}</div>
        {nota && <div className="text-xs text-suave">{nota}</div>}
      </div>
      <div className="shrink-0 whitespace-nowrap text-right text-sm font-medium tabular-nums">{valor}</div>
    </div>
  );
}

/** Barra de progreso accesible; `marca` (en basis points) dibuja un tope, por ejemplo el 40 % de concentración. */
export function Barra({ bps, marca, etiqueta }: { bps: number; marca?: number; etiqueta: string }) {
  const ancho = Math.min(100, Math.max(0, bps / 100));
  return (
    <div className="relative mt-3 h-2.5 rounded-full bg-linea" role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ancho)}>
      <div className="h-full rounded-full bg-acento transition-all" style={{ width: `${ancho}%` }} />
      {marca !== undefined && <div aria-hidden className="absolute -top-1 h-4.5 w-0.5 rounded bg-texto" style={{ left: `${marca / 100}%` }} />}
    </div>
  );
}

/** Indicador de pasos de un asistente (1 · 2 · 3). */
export function Pasos({ actual, pasos }: { actual: number; pasos: string[] }) {
  return (
    <ol aria-label="Progreso" className="flex items-center">
      {pasos.map((p, i) => {
        const n = i + 1;
        const hecho = n < actual;
        const activo = n === actual;
        return (
          <li key={p} aria-current={activo ? "step" : undefined} className="flex flex-1 items-center last:flex-none">
            <span className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${hecho || activo ? "bg-primario text-sobre-primario" : "border border-linea-fuerte text-suave"}`}>
                {hecho ? "✓" : n}
              </span>
              <span className={`text-sm ${activo ? "font-medium" : "text-suave"}`}>{p}</span>
            </span>
            {n < pasos.length && <span aria-hidden className={`mx-3 h-px flex-1 ${hecho ? "bg-texto" : "bg-linea"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Chip de filtro con contador. */
export function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${activo ? "border-texto bg-panel-2 font-medium text-texto" : "border-linea-fuerte text-suave hover:text-texto"}`}
    >
      {children}
    </button>
  );
}

/** Dirección o hash con botón para copiar. */
export function Copiable({ texto, children }: { texto: string; children: ReactNode }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // sin permiso de portapapeles: el texto sigue visible para copiarlo a mano
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {children}
      <button type="button" onClick={copiar} aria-label="Copiar" className="rounded-full border border-linea-fuerte px-2 py-0.5 text-xs text-suave hover:text-texto">
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </span>
  );
}
