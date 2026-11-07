// Políticas del fondo: contenido armado en src/lib/politicas.ts desde las constantes reales.
import { formatBps } from "@/lib/format";
import {
  SECCIONES,
  bandas,
  comoFunciona,
  cuotaparte,
  ejemplosTasa,
  factoresScoring,
  formulaCobertura,
  formulaTasa,
  garantiasEfectos,
  garantiasExplicacion,
  garantiasPorTipo,
  notaModeloPuntaje,
  objetivo,
  reglasObligatorias,
  seleccion,
  totalDeduccionesMaximas,
} from "@/lib/politicas";
import { BandaBadge, Tarjeta } from "./ui";

function Titulo({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="scroll-mt-32 text-lg font-semibold">
      {children}
    </h2>
  );
}

export function PoliticasFondo() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Políticas del fondo</h1>
        <p className="mt-1 text-sm text-suave">Qué reglas aplica el fondo, cómo se calcula el puntaje y qué pasa con tu cuotaparte. Todo sale de las mismas constantes que usa el sistema.</p>
        <nav aria-label="Secciones de políticas" className="mt-3 flex flex-wrap gap-2">
          {SECCIONES.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-linea-fuerte px-3 py-1 text-xs hover:bg-panel-2">
              {s.texto}
            </a>
          ))}
        </nav>
      </header>

      <section aria-labelledby="funcionamiento" className="space-y-3">
        <Titulo id="funcionamiento">Cómo funciona el fondo y cómo se generan las ganancias</Titulo>
        <Tarjeta>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {comoFunciona.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Tarjeta>
      </section>

      <section aria-labelledby="seleccion" className="space-y-3">
        <Titulo id="seleccion">Cómo se seleccionan y aprueban los activos</Titulo>
        <Tarjeta>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {seleccion.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </Tarjeta>
      </section>

      <section aria-labelledby="reglas" className="space-y-3">
        <Titulo id="reglas">Reglas obligatorias</Titulo>
        <p className="text-sm text-suave">Se cumplen siempre, sin importar el puntaje. Si una falla, el activo no se compra.</p>
        <ul className="space-y-3">
          {reglasObligatorias.map((r) => (
            <li key={r.id} id={`regla-${r.id}`} className="scroll-mt-32 rounded-2xl border border-linea-fuerte bg-panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primario px-2.5 py-0.5 text-xs font-medium text-sobre-primario">Obligatoria</span>
                <h3 className="text-sm font-semibold">{r.titulo}</h3>
              </div>
              <p className="mt-2 text-sm text-suave">{r.descripcion}</p>
              <p className="mt-2 text-xs text-suave">La hace cumplir: {r.aplica.toLowerCase()}.</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="puntaje" className="space-y-3">
        <Titulo id="puntaje">Factores del puntaje</Titulo>
        <p className="text-sm text-suave">{notaModeloPuntaje}</p>
        <p className="text-xs text-suave">Suma de las penalizaciones máximas: {totalDeduccionesMaximas} puntos (el puntaje nunca baja de 0).</p>
        <ul className="space-y-3">
          {factoresScoring.map((f) => (
            <li key={f.id} className="rounded-2xl border border-linea bg-panel p-4">
              <h3 className="text-sm font-semibold">{f.factor}</h3>
              <p className="mt-2 text-sm text-suave">{f.comoSeMide}</p>
              <div className="mt-3 flex items-center gap-3">
                <div role="img" aria-label={`Peso máximo: ${f.pesoMax} de 100 puntos`} className="h-2 flex-1 rounded-full bg-linea">
                  <div className="h-full rounded-full bg-acento" style={{ width: `${Math.min(100, f.pesoMax)}%` }} />
                </div>
                <span className="text-xs font-medium tabular-nums">{f.peso}</span>
              </div>
              {f.pendienteConfirmar ? <p className="mt-2 text-xs text-suave">Valor pendiente de confirmar con el equipo.</p> : null}
            </li>
          ))}
        </ul>
        <Tarjeta titulo="Bandas de riesgo">
          <ul className="space-y-2 text-sm">
            {bandas.map((b) => (
              <li key={b.banda} className="flex items-center justify-between gap-3">
                <BandaBadge banda={b.banda} />
                <span className="text-suave">
                  desde {b.desde} puntos · {b.descripcion.toLowerCase()}
                  {b.secompra ? "" : " · el fondo no compra"}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </section>

      <section aria-labelledby="garantias" className="space-y-3">
        <Titulo id="garantias">Garantías</Titulo>
        {garantiasExplicacion.map((t) => (
          <p key={t} className="text-sm text-suave">{t}</p>
        ))}
        <Tarjeta titulo="Qué cambia la garantía y qué no">
          <ul className="space-y-2 text-sm">
            {garantiasEfectos.map((e) => (
              <li key={e.texto} className="flex gap-2">
                <span aria-label={e.cambia ? "Sí influye" : "No influye"} className={`w-4 shrink-0 text-center font-semibold ${e.cambia ? "text-estado-pagado-tx" : "text-suave"}`}>{e.cambia ? "✓" : "–"}</span>
                <span>{e.texto}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
        <Tarjeta titulo="Cobertura y descuento por tipo">
          <p className="mb-3 text-sm font-medium">{formulaCobertura}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Descuento y liquidez por tipo de garantía</caption>
              <thead>
                <tr className="text-left text-xs text-suave">
                  <th scope="col" className="py-2 pr-3 font-medium">Tipo</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Descuento</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">Liquidez</th>
                </tr>
              </thead>
              <tbody>
                {garantiasPorTipo.map((g) => (
                  <tr key={g.tipo} className="border-t border-linea">
                    <th scope="row" className="py-2 pr-3 text-left font-medium">{g.nombre}</th>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBps(g.haircutBps)}</td>
                    <td className="py-2 pl-3 text-right capitalize">{g.liquidez}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      </section>

      <section aria-labelledby="tasa" className="space-y-3">
        <Titulo id="tasa">Tasa según puntaje</Titulo>
        <p className="text-sm text-suave">{formulaTasa}. Cuanto mejor el puntaje, menor la tasa que paga la pyme. Debajo del mínimo no se compra.</p>
        <div className="overflow-x-auto rounded-2xl border border-linea bg-panel">
          <table className="w-full text-sm">
            <caption className="sr-only">Ejemplos de puntaje, banda y tasa anual</caption>
            <thead>
              <tr className="text-left text-xs text-suave">
                <th scope="col" className="px-3 py-2 font-medium">Puntaje</th>
                <th scope="col" className="px-3 py-2 font-medium">Banda</th>
                <th scope="col" className="px-3 py-2 font-medium">Riesgo</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Tasa anual</th>
              </tr>
            </thead>
            <tbody>
              {ejemplosTasa.map((e) => (
                <tr key={e.puntaje} className="border-t border-linea">
                  <th scope="row" className="px-3 py-2 text-left font-medium tabular-nums">{e.puntaje}</th>
                  <td className="px-3 py-2">{e.banda}</td>
                  <td className="px-3 py-2">{e.nivelRiesgo}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {e.tasaTnaBps === null ? "Rechazado" : formatBps(e.tasaTnaBps)}
                    {e.aplicado ? <span className="block text-xs text-suave">{e.aplicado === "piso" ? "piso" : "tope"}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="objetivo" className="space-y-3">
        <Titulo id="objetivo">Objetivo de rentabilidad</Titulo>
        <Tarjeta>
          <p className="text-sm">{objetivo.texto}</p>
          <p role="note" className="mt-3 rounded-2xl border border-estado-pendiente-tx/40 bg-estado-pendiente-bg px-3 py-2 text-sm text-estado-pendiente-tx">
            {objetivo.aviso}
          </p>
          <p className="mt-3 text-xs text-suave">{objetivo.comision}</p>
        </Tarjeta>
      </section>

      <section aria-labelledby="cuotaparte" className="space-y-3">
        <Titulo id="cuotaparte">Qué pasa con la cuotaparte</Titulo>
        <Tarjeta>
          <dl className="space-y-3 text-sm">
            {cuotaparte.map((c) => (
              <div key={c.titulo}>
                <dt className="font-medium">{c.titulo}</dt>
                <dd className="text-suave">{c.texto}</dd>
              </div>
            ))}
          </dl>
        </Tarjeta>
      </section>
    </div>
  );
}
