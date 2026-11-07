"use client";
// Torta (anillo) en SVG, sin librerías. Accesible: la leyenda son botones con monto y %, el SVG se describe con aria-label.
import { useId, useState } from "react";
import { formatPermil, formatPesos } from "@/lib/format";
import { angulosPorciones, descripcionTorta, totalPorciones, trazoAnillo, type PorcionTorta } from "@/lib/torta";

const C = 100;
const R_EXT = 92;
const R_INT = 58;

export function Torta({
  porciones,
  titulo,
  etiquetaTotal = "Total",
  vacio = "Todavía no hay datos.",
}: {
  porciones: PorcionTorta[];
  titulo: string;
  etiquetaTotal?: string;
  vacio?: string;
}) {
  const id = useId();
  const [elegida, setElegida] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);

  if (porciones.length === 0) {
    return <p className="py-6 text-center text-sm text-suave">{vacio}</p>;
  }

  const activa = porciones.find((p) => p.clave === (encima ?? elegida)) ?? null;
  const angulos = angulosPorciones(porciones.map((p) => p.permil));
  const total = totalPorciones(porciones);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
      <div className="relative h-[200px] w-[200px] shrink-0">
        <svg viewBox="0 0 200 200" role="img" aria-labelledby={`${id}-t`} className="h-full w-full">
          <title id={`${id}-t`}>{descripcionTorta(titulo, porciones, formatPermil)}</title>
          {porciones.map((p, i) => (
            <path
              key={p.clave}
              d={trazoAnillo(C, C, R_EXT, R_INT, angulos[i].inicio, angulos[i].fin)}
              fillRule="evenodd"
              fill={p.color}
              stroke="var(--panel)"
              strokeWidth="2"
              opacity={activa && activa.clave !== p.clave ? 0.35 : 1}
              className="cursor-pointer transition-opacity"
              onMouseEnter={() => setEncima(p.clave)}
              onMouseLeave={() => setEncima(null)}
              onClick={() => setElegida((e) => (e === p.clave ? null : p.clave))}
            />
          ))}
        </svg>
        <div aria-live="polite" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-12 text-center">
          <span className="line-clamp-2 text-xs text-suave">{activa ? activa.etiqueta : etiquetaTotal}</span>
          <span className="mt-0.5 text-sm font-semibold tabular-nums">{formatPesos(activa ? activa.monto : total)}</span>
          <span className="text-xs tabular-nums text-suave">{activa ? formatPermil(activa.permil) : "100 %"}</span>
        </div>
      </div>

      <ul aria-label={`Leyenda: ${titulo}`} className="w-full min-w-0 flex-1">
        {porciones.map((p) => {
          const seleccionada = activa?.clave === p.clave;
          return (
            <li key={p.clave} className="border-t border-linea first:border-t-0">
              <button
                type="button"
                aria-pressed={elegida === p.clave}
                onClick={() => setElegida((e) => (e === p.clave ? null : p.clave))}
                onMouseEnter={() => setEncima(p.clave)}
                onMouseLeave={() => setEncima(null)}
                className={`-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-panel-2 ${seleccionada ? "bg-panel-2" : ""}`}
              >
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate" title={p.etiqueta}>{p.etiqueta}</span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block font-medium">{formatPermil(p.permil)}</span>
                  <span className="block text-xs text-suave">{formatPesos(p.monto)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
