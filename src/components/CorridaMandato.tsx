"use client";
import { useState, useSyncExternalStore } from "react";
import type { TipoActivo } from "@/shared/types";
import type { ErrorUi } from "@/lib/api-client";
import { formatPesos } from "@/lib/format";
import { crearClienteMandato, type Bandeja } from "@/lib/mandato-client";
import {
  CorridaMandato,
  ETIQUETA_RESULTADO,
  activoSorpresa,
  armarInforme,
  contadores,
  itemEnTurno,
  type ErroresSorpresa,
  type SnapshotCorrida,
} from "@/lib/mandato-ui";
import { useApi } from "@/lib/use-api";
import { InformeFinal } from "./InformeFinal";
import { campo, InterruptorRebote, MandatoForm } from "./MandatoForm";
import { TarjetaActivo } from "./TarjetaActivo";
import { Boton, Cargando, ErrorApiCaja, ErrorCaja, Metrica, Tarjeta } from "./ui";

const EN_MARCHA = ["corriendo", "pausada", "esperando_aprobacion"] as const;

function AvisoAcceso({ error, onReanudar }: { error: ErrorUi; onReanudar: () => void }) {
  return (
    <div role="alert" className="rounded-ui border border-linea-fuerte bg-panel-2 px-3 py-3 text-sm">
      <p className="font-medium">La corrida quedó en pausa: falta la clave de la demo</p>
      <p className="mt-1 text-suave">{error.mensaje} Ingresala en otra pestaña (dura 12 horas), volvé acá y reanudá: lo ya analizado no se repite.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/api/demo/acceso" target="_blank" rel="noopener noreferrer" className="rounded-full bg-primario px-4 py-2 text-xs font-medium text-sobre-primario hover:opacity-85">
          Ingresar la clave de la demo
        </a>
        <Boton onClick={onReanudar} className="px-4 py-2 text-xs">Ya ingresé: reanudar</Boton>
      </div>
    </div>
  );
}

/** Bloque 3: pausar, revocar, interruptor de rebote. Pegado abajo para que se vea siempre mientras corre. */
function Controles({ s, c, simular, onSimular }: { s: SnapshotCorrida; c: CorridaMandato; simular: boolean; onSimular: (v: boolean) => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const enMarcha = (EN_MARCHA as readonly string[]).includes(s.fase);
  const estadoTexto =
    s.revocando ? "Revocando el mandato…"
    : s.rebotando ? "Simulando el rebote…"
    : s.fase === "pausada" ? "En pausa"
    : s.pausaPedida ? "Pausando al terminar la llamada en curso…"
    : s.fase === "esperando_aprobacion" ? "Esperando tu aprobación"
    : s.fase === "corriendo" ? "Corriendo"
    : s.fase === "terminada" ? "Terminó"
    : s.fase === "revocada" ? "Mandato revocado"
    : "";
  return (
    <section aria-label="Controles del mandato" className="sticky bottom-3 z-10 rounded-2xl border border-linea-fuerte bg-panel p-3 shadow-[0_0_0_4px_var(--fondo)]">
      <div className="flex flex-wrap items-center gap-2">
        <span role="status" className="mr-auto text-sm font-medium">{estadoTexto}</span>
        {enMarcha && (
          s.fase === "pausada" ? (
            <Boton variante="primario" onClick={() => c.reanudar()} className="px-4 py-2">Reanudar</Boton>
          ) : (
            <Boton onClick={() => c.pausar()} disabled={s.pausaPedida || s.revocando || s.fase === "esperando_aprobacion"} className="px-4 py-2">Pausar</Boton>
          )
        )}
        {enMarcha && !confirmando && <Boton onClick={() => setConfirmando(true)} disabled={s.revocando} className="px-4 py-2">Revocar mandato</Boton>}
        {enMarcha && confirmando && (
          <span className="flex items-center gap-2 text-sm">
            ¿Revocar?
            <Boton variante="primario" onClick={() => { setConfirmando(false); void c.revocar(); }} className="px-4 py-2">Sí, revocar</Boton>
            <Boton onClick={() => setConfirmando(false)} className="px-4 py-2">No</Boton>
          </span>
        )}
      </div>
      {enMarcha && (
      <div className="mt-3 border-t border-linea pt-3">
        <InterruptorRebote compacto activo={simular} onCambio={(v) => { onSimular(v); c.setSimularRebote(v); }} />
      </div>
      )}
    </section>
  );
}

function Sorpresa({ c, habilitado }: { c: CorridaMandato; habilitado: boolean }) {
  const [cuit, setCuit] = useState("");
  const [nominal, setNominal] = useState("");
  const [dias, setDias] = useState("30");
  const [tipo, setTipo] = useState<TipoActivo>("cheque");
  const [errores, setErrores] = useState<ErroresSorpresa>({});
  const [n, setN] = useState(0);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const r = activoSorpresa({ cuit, nominal, dias, tipo }, n + 1);
    if (!r.ok) return setErrores(r.errores);
    setErrores({});
    if (c.agregarSorpresa(r.activo)) {
      setN(n + 1);
      setCuit("");
    }
  }
  return (
    <Tarjeta titulo="CUIT sorpresa">
      <p className="mb-3 text-sm text-suave">Probá cualquier CUIT: el agente lo analiza, lo evalúa con tu mandato y, si cumple, lo compra, con el mismo circuito.</p>
      <form onSubmit={enviar} noValidate className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="s-cuit" className="text-sm">CUIT</label>
          <input id="s-cuit" inputMode="numeric" value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="30-70308853-4" aria-invalid={!!errores.cuit} className={campo} />
          {errores.cuit && <p role="alert" className="mt-1 text-xs text-estado-rechazado-tx">{errores.cuit}</p>}
        </div>
        <div>
          <label htmlFor="s-tipo" className="text-sm">Instrumento</label>
          <select id="s-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoActivo)} className={campo}>
            <option value="cheque">Cheque</option>
            <option value="pagare">Pagaré</option>
          </select>
        </div>
        <div>
          <label htmlFor="s-nominal" className="text-sm">Nominal (pesos)</label>
          <input id="s-nominal" inputMode="numeric" value={nominal} onChange={(e) => setNominal(e.target.value)} aria-invalid={!!errores.nominal} className={campo} />
          {errores.nominal && <p role="alert" className="mt-1 text-xs text-estado-rechazado-tx">{errores.nominal}</p>}
        </div>
        <div>
          <label htmlFor="s-dias" className="text-sm">Plazo (días)</label>
          <input id="s-dias" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} aria-invalid={!!errores.dias} className={campo} />
          {errores.dias && <p role="alert" className="mt-1 text-xs text-estado-rechazado-tx">{errores.dias}</p>}
        </div>
        <div className="sm:col-span-2">
          <Boton type="submit" disabled={!habilitado}>Sumar a la corrida</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

function Contadores({ s }: { s: SnapshotCorrida }) {
  const k = contadores(s.items);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Metrica etiqueta="Invertido" valor={formatPesos(s.estado?.invertido ?? "0")} />
      <Metrica etiqueta="Disponible" valor={formatPesos(s.estado?.disponible ?? "0")} />
      <Metrica etiqueta="Compró" valor={k.comprados} />
      <Metrica etiqueta="Omitió" valor={k.omitidos} />
      <Metrica etiqueta="Contrato dijo que no" valor={k.rechazados} className="col-span-2 sm:col-span-1" />
    </div>
  );
}

/** Texto para lectores de pantalla: una línea por resultado, sin repetir los pasos. */
function RegistroAccesible({ s }: { s: SnapshotCorrida }) {
  const lineas = s.items.filter((i) => i.resultado).map((i) => `${i.activo.nombre}: ${ETIQUETA_RESULTADO[i.resultado!].texto}.`);
  return <div role="log" aria-live="polite" aria-label="Resultados de la corrida" className="sr-only">{lineas.join(" ")}{s.notas.join(" ")}</div>;
}

function Corrida({ c, s, simular, onSimular }: { c: CorridaMandato; s: SnapshotCorrida; simular: boolean; onSimular: (v: boolean) => void }) {
  const informe = s.fase === "terminada" || s.fase === "revocada" ? armarInforme(s) : null;
  const m = s.estado?.mandato;
  return (
    <div className="space-y-5">
      {m && (
        <p className="text-sm text-suave">
          Mandato: presupuesto {formatPesos(m.presupuesto)} · banda {m.bandaMinima} o mejor · hasta {m.topeEmisorBps / 100} % por emisor · hasta {m.plazoMaxDias} días
          {m.aprobacionSobre ? ` · pide tu aprobación sobre ${formatPesos(m.aprobacionSobre)}` : " · autónomo"}
        </p>
      )}
      <Contadores s={s} />

      {s.fase === "fallo" && s.aviso && (
        <div className="space-y-3">
          <ErrorApiCaja error={s.aviso} />
          <Boton onClick={() => c.reiniciar()}>Volver a las reglas</Boton>
        </div>
      )}
      {s.aviso && s.fase === "pausada" && (
        s.aviso.codigo === "NO_AUTORIZADO" ? <AvisoAcceso error={s.aviso} onReanudar={() => c.reanudar()} /> : <ErrorCaja mensaje={s.aviso.mensaje} onReintentar={() => c.reanudar()} />
      )}
      {s.fase === "revocada" && s.aviso && <ErrorCaja mensaje={s.aviso.mensaje} />}
      {s.notas.map((n) => <p key={n} className="text-sm text-suave">{n}</p>)}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-suave">2 · Corrida en vivo</h2>
        <ol aria-label="Activos de la corrida" className="space-y-3">
          {s.items.map((i) => (
            <TarjetaActivo key={i.id} item={i} enTurno={s.fase !== "terminada" && s.fase !== "revocada" && itemEnTurno(s.items)?.id === i.id} onAprobar={() => c.aprobar(i.id)} onOmitir={() => c.omitir(i.id)} />
          ))}
        </ol>
      </div>
      <RegistroAccesible s={s} />

      {informe && <InformeFinal informe={informe} />}
      {s.fase === "terminada" || s.fase === "revocada" ? (
        <Boton onClick={() => c.reiniciar()}>Armar otro mandato</Boton>
      ) : null}

      {s.fase !== "fallo" && <Sorpresa c={c} habilitado={s.fase !== "revocada" && !s.revocando} />}
      {s.fase !== "fallo" && <Controles s={s} c={c} simular={simular} onSimular={onSimular} />}
    </div>
  );
}

function Pantalla({ bandeja }: { bandeja: Bandeja }) {
  const [c] = useState(() => new CorridaMandato(crearClienteMandato((url, init) => fetch(url, init))));
  const s = useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot);
  const [simular, setSimular] = useState(true);
  const mostrarForm = s.fase === "inactiva" || s.fase === "iniciando" || (s.fase === "fallo" && s.items.length === 0);

  return (
    <>
      {mostrarForm ? (
        <MandatoForm
          mandatoInicial={bandeja.mandatoPorDefecto}
          activos={bandeja.activos}
          simularRebote={simular}
          onSimularRebote={setSimular}
          iniciando={s.fase === "iniciando"}
          error={s.fase === "fallo" ? (s.aviso ?? undefined) : undefined}
          onIniciar={(mandato) => void c.iniciar({ mandato, activos: bandeja.activos, simularRebote: simular })}
        />
      ) : (
        <Corrida c={c} s={s} simular={simular} onSimular={setSimular} />
      )}
    </>
  );
}

export function MandatoPantalla() {
  const b = useApi<Bandeja>("/api/mandato/bandeja");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Mandato</h1>
        <p className="mt-1 text-sm text-suave">Fijás tus reglas una vez y el agente invierte por vos. Lo que no cumple, no se compra.</p>
      </div>
      {b.estado === "cargando" && <Cargando lineas={4} />}
      {b.estado === "error" && <ErrorCaja mensaje={b.mensaje} onReintentar={b.recargar} />}
      {b.estado === "listo" && <Pantalla bandeja={b.datos} />}
    </div>
  );
}
