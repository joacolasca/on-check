"use client";
import Link from "next/link";
import { useState } from "react";
import type { Cotizacion } from "@/shared/types";
import type { PasoAgente, ResultadoAgente } from "@/lib/agent";
import { analizarEnVivo } from "@/lib/agent-client";
import { rutaDetalle } from "@/lib/detalle-vista";
import { guardarInformeLocal } from "@/lib/informe-local";
import { api, mensajeDeError, type ErrorUi } from "@/lib/api-client";
import {
  DESCRIPCION_BANDA,
  formatBps,
  formatFecha,
  formatPesos,
  hashCorto,
  urlTx,
} from "@/lib/format";
import { NOMBRE_EMISOR, NOMBRE_TIPO } from "@/lib/cotizacion";
import { armarEntrada, etiquetaFuente, explicarErrorFondeo, pasoDeFase, type ValoresFormulario } from "@/lib/pyme";
import { AnalisisAgente } from "./AnalisisAgente";
import { FormularioActivo } from "./FormularioActivo";
import { AnalisisGarantia, ConsultaMav, DecisionGestor, IndustriaEstimada } from "./ResultadoPM";
import { BandaBadge, Boton, ErrorApiCaja, ErrorCaja, EstadoBadge, Fila, LinkBaseScan, Pasos, Tarjeta } from "./ui";

interface Registro { chequeId: string; tx: string }
interface Fondeo { tx: string }
type Fase =
  | { tipo: "form" }
  | { tipo: "cotizando" }
  | { tipo: "cotizado"; cot: Cotizacion; errorAccion?: ErrorUi }
  | { tipo: "registrando"; cot: Cotizacion }
  | { tipo: "fondeando"; cot: Cotizacion; registro: Registro }
  | { tipo: "listo"; cot: Cotizacion; registro: Registro; fondeo: Fondeo }
  | { tipo: "fallo"; cot: Cotizacion; registro: Registro; codigo: string; mensaje: string };

function ResumenCotizacion({ cot }: { cot: Cotizacion }) {
  const s = cot.scoring;
  const quien = NOMBRE_EMISOR[cot.tipo];
  return (
    <div className="space-y-4">
      <DecisionGestor cot={cot} />
      <div>
        <Fila etiqueta={`Nominal del ${cot.tipo === "pagare" ? "pagaré" : "cheque"}`} valor={formatPesos(cot.input.nominal)} />
        <Fila etiqueta="Vencimiento" valor={formatFecha(cot.input.vencimiento)} nota={`En ${cot.dias} días`} />
        <Fila etiqueta="Tasa anual (TNA)" valor={formatBps(cot.tasaTnaBps)} />
        <Fila etiqueta="Descuento" valor={formatPesos(cot.descuento)} />
      </div>
      <div className="rounded-2xl border border-linea bg-panel-2 px-4 py-4">
        <div className="text-xs text-suave">Recibís hoy</div>
        <div className="text-3xl font-semibold tabular-nums text-acento">{formatPesos(cot.precioCompra)}</div>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-suave">Puntaje del {quien}</span>
          <span className="text-lg font-semibold tabular-nums">{s.puntaje}/100</span>
          <BandaBadge banda={s.banda} />
          <span className="text-sm text-suave">{DESCRIPCION_BANDA[s.banda]}</span>
        </div>
        {s.denominacion && <p className="mt-1 text-sm text-suave"><span className="capitalize">{quien}</span>: {s.denominacion}</p>}
        {s.ajustes.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {s.ajustes.map((a) => (
              <li key={a.motivo} className="font-mono">
                {a.puntos > 0 ? "+" : a.puntos < 0 ? "−" : ""}{Math.abs(a.puntos)} <span className="font-sans text-suave">· {a.motivo}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-suave">Fuente: {etiquetaFuente(s.fuente)} · consultado el {formatFecha(s.consultadoEn)}</p>
      </div>
      <p className="text-sm">{cot.explicacion}</p>
      <Link href="/politicas#reglas" className="inline-block text-xs text-enlace underline-offset-2 hover:underline">Ver las reglas, el puntaje y la tasa del fondo</Link>
      <IndustriaEstimada cot={cot} />
      <ConsultaMav cot={cot} />
      <AnalisisGarantia cot={cot} />
      <p className="text-xs text-suave">
        Esta cotización tiene un código de verificación (<span className="font-mono">{hashCorto(cot.cotizacionHash)}</span>) que queda registrado en Base: cualquiera puede comprobar que la explicación no se cambió después.
      </p>
    </div>
  );
}

type EstadoPaso = "pendiente" | "enCurso" | "hecho" | "fallo";

function Paso({ estado, titulo, detalle, children }: { estado: EstadoPaso; titulo: React.ReactNode; detalle?: string; children?: React.ReactNode }) {
  const marca = { pendiente: "○", enCurso: "◔", hecho: "●", fallo: "✕" }[estado];
  const color = { pendiente: "text-suave", enCurso: "text-acento", hecho: "text-estado-pagado-tx", fallo: "text-estado-rechazado-tx" }[estado];
  return (
    <li className="flex gap-3">
      <span aria-hidden className={`mt-0.5 font-mono ${color}`}>{marca}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm">{titulo}</div>
        {detalle && <p className="text-xs text-suave">{detalle}</p>}
        {children}
      </div>
    </li>
  );
}

function LineaDeTiempo({ fase }: { fase: Exclude<Fase, { tipo: "form" | "cotizando" | "cotizado" }> }) {
  const { cot } = fase;
  const registro = fase.tipo === "registrando" ? null : fase.registro;
  const fondeo = fase.tipo === "listo" ? fase.fondeo : null;
  const e1: EstadoPaso = fase.tipo === "registrando" ? "enCurso" : "hecho";
  const e2: EstadoPaso = fase.tipo === "fondeando" ? "enCurso" : fase.tipo === "listo" ? "hecho" : fase.tipo === "fallo" ? "fallo" : "pendiente";
  return (
    <ol aria-live="polite" className="space-y-4">
      <Paso
        estado={e1}
        titulo={<><EstadoBadge estado="Pending" /> {NOMBRE_TIPO[cot.tipo]} registrado en Base</>}
        detalle={e1 === "enCurso" ? "Registrando…" : "Quedó público, con su puntaje y la tasa acordada."}
      >
        {registro && <LinkBaseScan href={urlTx(registro.tx)}>{hashCorto(registro.tx)} ↗</LinkBaseScan>}
      </Paso>
      <Paso
        estado={e2}
        titulo={<><EstadoBadge estado="Funded" /> El fondo compra el activo</>}
        detalle={e2 === "enCurso" ? "Comprando…" : e2 === "hecho" ? `Recibiste ${formatPesos(cot.precioCompra)} en tu cuenta.` : e2 === "fallo" ? "No se pudo completar." : "Falta este paso."}
      >
        {fondeo && <LinkBaseScan href={urlTx(fondeo.tx)}>{hashCorto(fondeo.tx)} ↗</LinkBaseScan>}
      </Paso>
    </ol>
  );
}

export function CargarCheque() {
  const [fase, setFase] = useState<Fase>({ tipo: "form" });
  const [errorForm, setErrorForm] = useState<ErrorUi | undefined>();
  const [pasosVivos, setPasosVivos] = useState<PasoAgente[]>([]);
  const [analisis, setAnalisis] = useState<Pick<ResultadoAgente, "pasos" | "alertas" | "modo"> | null>(null);

  async function cotizar(v: ValoresFormulario) {
    setErrorForm(undefined);
    setPasosVivos([]);
    setFase({ tipo: "cotizando" });
    try {
      const r = await analizarEnVivo(
        armarEntrada(v),
        { onPaso: (p) => setPasosVivos((prev) => [...prev, p]), onReinicio: () => setPasosVivos([]) },
      );
      if (r.informe) guardarInformeLocal(r.informe); // sesión rápida: el detalle lo recupera si el servidor ya no lo tiene
      setAnalisis({ pasos: r.pasos, alertas: r.alertas, modo: r.modo });
      setFase({ tipo: "cotizado", cot: r.cotizacion });
    } catch (e) {
      setErrorForm(mensajeDeError(e));
      setFase({ tipo: "form" });
    }
  }

  async function aceptar(cot: Cotizacion) {
    setFase({ tipo: "registrando", cot });
    let registro: Registro;
    try {
      registro = await api.post<Registro>("/api/cheques", { cotizacionId: cot.id, cotizacion: cot });
    } catch (e) {
      setFase({ tipo: "cotizado", cot, errorAccion: mensajeDeError(e) });
      return;
    }
    setFase({ tipo: "fondeando", cot, registro });
    try {
      const fondeo = await api.post<Fondeo>(`/api/cheques/${registro.chequeId}/fondear`);
      setFase({ tipo: "listo", cot, registro, fondeo });
    } catch (e) {
      const { codigo, mensaje } = mensajeDeError(e);
      setFase({ tipo: "fallo", cot, registro, codigo, mensaje });
    }
  }

  const reiniciar = () => { setErrorForm(undefined); setAnalisis(null); setFase({ tipo: "form" }); };

  return (
    <div className="mx-auto max-w-3xl space-y-5 md:mx-0">
      <div>
        <h1 className="text-2xl font-semibold">Cargá tu cheque o pagaré</h1>
        <p className="mt-1 text-sm text-suave">
          Te mostramos cuánto te adelantamos hoy y por qué. Miramos a quien paga, no a quien vende.
        </p>
      </div>

      <Pasos actual={pasoDeFase(fase.tipo)} pasos={["Datos", "Cotización", "Estado"]} />

      {fase.tipo === "form" && (
        <Tarjeta titulo="Datos del activo">
          <FormularioActivo onCotizar={cotizar} errorApi={errorForm} />
        </Tarjeta>
      )}

      {fase.tipo === "cotizando" && <AnalisisAgente pasos={pasosVivos} enVivo />}

      {fase.tipo !== "form" && fase.tipo !== "cotizando" && (
        <Tarjeta titulo="Tu cotización">
          <ResumenCotizacion cot={fase.cot} />
          {analisis?.alertas.map((a) => (
            <div key={a} role="alert" className="mt-4 rounded-2xl border border-estado-pendiente-tx/40 bg-estado-pendiente-bg px-3 py-3 text-sm text-estado-pendiente-tx">
              {a}
            </div>
          ))}
        </Tarjeta>
      )}

      {fase.tipo !== "form" && fase.tipo !== "cotizando" && analisis && (
        <AnalisisAgente pasos={analisis.pasos} modo={analisis.modo} />
      )}

      {fase.tipo === "cotizado" && (
        <div className="space-y-3">
          {fase.errorAccion && <ErrorApiCaja error={fase.errorAccion} />}
          {fase.cot.aprobada ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Boton variante="primario" className="sm:order-first" onClick={() => aceptar(fase.cot)}>Aceptar y cobrar {formatPesos(fase.cot.precioCompra)}</Boton>
              <Boton onClick={reiniciar}>Cotizar otro</Boton>
            </div>
          ) : (
            <>
              <ErrorCaja mensaje={fase.cot.motivoRechazo ?? "Este activo no cumple las reglas del fondo."} />
              <Boton onClick={reiniciar}>Cotizar otro</Boton>
            </>
          )}
        </div>
      )}

      {(fase.tipo === "registrando" || fase.tipo === "fondeando" || fase.tipo === "listo" || fase.tipo === "fallo") && (
        <Tarjeta titulo="Estado del activo">
          <LineaDeTiempo fase={fase} />
          {fase.tipo === "fallo" && (() => {
            const x = explicarErrorFondeo(fase.codigo, fase.mensaje);
            return (
              <div role="alert" className="mt-4 rounded-ui border border-estado-pendiente-tx/40 bg-estado-pendiente-bg px-3 py-3 text-sm text-estado-pendiente-tx">
                <p className="font-medium">{x.titulo}</p>
                <p className="mt-1">{x.detalle}</p>
              </div>
            );
          })()}
          {(fase.tipo === "listo" || fase.tipo === "fallo") && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={rutaDetalle(fase.registro.chequeId)} className="rounded-full border border-linea-fuerte px-5 py-2.5 text-sm font-medium text-texto transition hover:bg-panel-2">Ver detalle del activo</Link>
              <Boton onClick={reiniciar}>Cargar otro activo</Boton>
            </div>
          )}
        </Tarjeta>
      )}
    </div>
  );
}
