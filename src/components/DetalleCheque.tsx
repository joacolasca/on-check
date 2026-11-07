"use client";
import Link from "next/link";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { Cotizacion } from "@/shared/types";
import { NIVEL_RIESGO, type InformeActivo } from "@/lib/agent/informe";
import { DESCRIPCION_DECISION, NOMBRE_EMISOR, NOMBRE_GARANTIA, NOMBRE_TIPO } from "@/lib/cotizacion";
import type { ChequeDetalle } from "@/lib/detalle-cheque";
import { MENSAJE_NO_ENCONTRADO, NOTA_SIN_INFORME, etiquetaCumple, puntosConSigno, separarReglas } from "@/lib/detalle-vista";
import { DESCRIPCION_BANDA, ETIQUETA_ESTADO, formatBps, formatFecha, formatPesos, hashCorto } from "@/lib/format";
import { leerInformeLocal } from "@/lib/informe-local";
import { useApi } from "@/lib/use-api";
import { ListaPasos } from "./AnalisisAgente";
import { AnalisisGarantia, ConsultaMav, IndustriaEstimada } from "./ResultadoPM";
import { BandaBadge, Cargando, Copiable, ErrorCaja, EstadoBadge, Fila, LinkBaseScan, Tarjeta } from "./ui";

type Origen = "servidor" | "navegador";

const enlace = "text-enlace underline-offset-2 hover:underline";

function MarcaRegla({ cumple }: { cumple: boolean | null }) {
  const clase = cumple === null ? "border-linea-fuerte text-suave" : cumple ? "bg-estado-pagado-bg text-estado-pagado-tx" : "bg-estado-rechazado-bg text-estado-rechazado-tx";
  return <span className={`shrink-0 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium ${clase}`}>{etiquetaCumple(cumple)}</span>;
}

function ListaReglas({ reglas }: { reglas: InformeActivo["reglas"] }) {
  return (
    <ul>
      {reglas.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 border-t border-linea py-3 first:border-t-0">
          <div className="min-w-0">
            <div className="text-sm font-medium">{r.regla}</div>
            <p className="text-xs text-suave">{r.detalle}</p>
          </div>
          <MarcaRegla cumple={r.cumple} />
        </li>
      ))}
    </ul>
  );
}

function Reglas({ i }: { i: InformeActivo }) {
  const { sistema, contrato } = separarReglas(i.reglas);
  return (
    <Tarjeta titulo="Reglas del fondo">
      <p className="text-sm font-medium">Las verificó el sistema al cotizar</p>
      <ListaReglas reglas={sistema} />
      <p className="mt-4 text-sm font-medium">Las hace cumplir el contrato al comprar</p>
      <p className="text-xs text-suave">Acá mostramos la proyección con la cartera de ese momento; el contrato revisa de nuevo con la cartera real.</p>
      <ListaReglas reglas={contrato} />
      <p className="mt-3 text-xs">
        <Link href="/politicas#reglas" className={enlace}>Ver las reglas del fondo</Link>
      </p>
    </Tarjeta>
  );
}

function Decision({ i }: { i: InformeActivo }) {
  const ok = i.decision.aprobada;
  return (
    <Tarjeta titulo="Decisión y motivos">
      <p className={`text-lg font-semibold ${ok ? "text-estado-pagado-tx" : "text-estado-rechazado-tx"}`}>{ok ? "Aprobado" : "No aprobado"}</p>
      <p className="mt-1 text-sm text-suave">
        {ok ? "Cumplió las reglas que verifica el sistema." : (i.decision.motivo ?? "No cumple las reglas del fondo.")} La decisión la toma el sistema con reglas fijas, no el agente.
      </p>
      {i.alertas.length > 0 && (
        <ul className="mt-3 space-y-2">
          {i.alertas.map((a) => (
            <li key={a} role="alert" className="rounded-2xl border border-estado-pendiente-tx/40 bg-estado-pendiente-bg px-3 py-2 text-sm text-estado-pendiente-tx">
              {a}
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function Emisor({ i }: { i: InformeActivo }) {
  const e = i.empresa;
  const emisor = NOMBRE_EMISOR[i.activo.tipo];
  return (
    <Tarjeta titulo={`Emisor (${emisor})`}>
      <Fila etiqueta="Razón social" valor={e.denominacion ?? "No disponible"} />
      <Fila etiqueta="CUIT" valor={<span className="font-mono">{e.cuitEnmascarado}</span>} />
      <Fila etiqueta="Puntaje" valor={<span className="inline-flex items-center gap-2">{e.puntaje}/100 <BandaBadge banda={e.banda} /></span>} nota={`Riesgo ${e.nivelRiesgo.toLowerCase()}`} />
      <Fila etiqueta="Peor situación en el BCRA" valor={e.situacionPeor} />
      <Fila etiqueta="Cheques rechazados impagos" valor={e.chequesRechazadosImpagos} />
      <Fila etiqueta="Refinanciaciones" valor={e.refinanciaciones ? "Sí" : "No"} />
      <Fila etiqueta="Deuda creciente" valor={e.deudaCreciente ? "Sí" : "No"} />
      {e.ajustes.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-linea pt-3 text-sm">
          {e.ajustes.map((a) => (
            <li key={a.motivo} className="font-mono">
              {puntosConSigno(a.puntos)} <span className="font-sans text-suave">· {a.motivo}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-suave">
        Fuente: Central de Deudores del BCRA ({e.fuente === "bcra-live" ? "consulta en vivo" : "copia guardada"}) · consultado el {formatFecha(e.consultadoEn)}
      </p>
      <p className="mt-1 text-xs">
        <Link href="/politicas#puntaje" className={enlace}>¿Cómo se calcula el puntaje y la tasa?</Link>
      </p>
    </Tarjeta>
  );
}

function ActivoDelInforme({ i }: { i: InformeActivo }) {
  const a = i.activo;
  return (
    <Tarjeta titulo={`Análisis del ${NOMBRE_TIPO[a.tipo].toLowerCase()}`}>
      <Fila etiqueta="Valor nominal" valor={formatPesos(a.nominal)} />
      <Fila etiqueta="Vencimiento" valor={formatFecha(a.vencimiento)} nota={`En ${a.dias} días al momento del análisis`} />
      <Fila etiqueta="Tasa anual (TNA)" valor={formatBps(a.tasaTnaBps)} />
      <Fila etiqueta="Descuento" valor={formatPesos(a.descuento)} />
      <Fila etiqueta="Adelanto" valor={formatPesos(a.precioCompra)} />
      {a.rentabilidadEsperada && (
        <div className="mt-3 rounded-2xl border border-linea bg-panel-2 px-3 py-3 text-sm">
          <div className="font-medium">{a.rentabilidadEsperada.etiqueta}</div>
          <p className="mt-1 tabular-nums">{a.rentabilidadEsperada.periodo} en el plazo · {a.rentabilidadEsperada.anualizada} anualizada</p>
          <p className="mt-1 text-xs text-suave">{a.rentabilidadEsperada.nota}</p>
        </div>
      )}
    </Tarjeta>
  );
}

/** Los bloques de ResultadoPM esperan una cotización: se les pasa solo el pedazo que usan. */
const parcial = (i: InformeActivo): Cotizacion => ({ garantia: i.garantia ?? undefined, industria: i.industria, mav: i.mav ?? undefined }) as unknown as Cotizacion;

function AnalisisDelAgente({ i }: { i: InformeActivo }) {
  const r = i.agente.recomendacion ? DESCRIPCION_DECISION[i.agente.recomendacion] : null;
  const cot = parcial(i);
  return (
    <div className="space-y-3">
      <Tarjeta titulo="Análisis del agente analista (explicativo)">
        {r && <p className="mb-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.clases}`}>{r.titulo}</span></p>}
        <p className="text-sm">{i.agente.explicacion}</p>
        <p className="mt-2 text-xs text-suave">Es una explicación del agente: no cambia las reglas ni la decisión de arriba.</p>
        <div className="mt-3 space-y-3">
          {i.industria && <IndustriaEstimada cot={cot} />}
          {i.mav && <ConsultaMav cot={cot} />}
        </div>
      </Tarjeta>
      <details className="group">
        <summary className="cursor-pointer rounded-2xl border border-linea px-4 py-3 text-sm text-suave hover:text-texto">Ver los pasos del agente ({i.agente.pasos.length})</summary>
        <div className="mt-3">
          <ListaPasos pasos={i.agente.pasos} />
        </div>
      </details>
    </div>
  );
}

function Garantia({ c, informe }: { c: ChequeDetalle["cheque"]; informe: InformeActivo | null }) {
  if (!c.garantia) {
    return (
      <Tarjeta titulo="Garantía">
        <p className="text-sm text-suave">Este activo no tiene garantía.</p>
        <p className="mt-2 text-xs"><Link href="/politicas#garantias" className={enlace}>Cómo funcionan las garantías</Link></p>
      </Tarjeta>
    );
  }
  return (
    <Tarjeta titulo="Garantía">
      <Fila etiqueta="Tipo" valor={NOMBRE_GARANTIA[c.garantia.tipo]} nota="Registrado on-chain" />
      <Fila etiqueta="Cobertura del nominal" valor={formatBps(c.garantia.coberturaBps)} nota="Registrado on-chain" />
      {informe?.garantia && <div className="mt-3"><AnalisisGarantia cot={parcial(informe)} /></div>}
      <p className="mt-2 text-xs"><Link href="/politicas#garantias" className={enlace}>Qué es la cobertura de la garantía</Link></p>
    </Tarjeta>
  );
}

function Contenido({ d }: { d: ChequeDetalle }) {
  const c = d.cheque;
  // sessionStorage no existe en el servidor: useSyncExternalStore da null al renderizar allá y el valor real en el navegador.
  // El snapshot es un string (comparable por valor) para no re-renderizar en bucle.
  const crudo = useSyncExternalStore(
    () => () => undefined,
    () => (d.informe ? null : JSON.stringify(leerInformeLocal(c.id, d.cotizacionHash))),
    () => null,
  );
  const local = useMemo<InformeActivo | null>(() => (crudo && crudo !== "null" ? (JSON.parse(crudo) as InformeActivo) : null), [crudo]);
  const informe = d.informe ?? local;
  const origen: Origen | null = d.informe ? "servidor" : local ? "navegador" : null;
  const nombreTipo = NOMBRE_TIPO[c.tipo];

  return (
    <div className="space-y-5">
      <Tarjeta>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{nombreTipo} {c.emisorNombre ?? c.libradorHashCorto}</h1>
          <EstadoBadge estado={c.estado} />
        </div>
        <p className="mt-1 text-sm text-suave">{ETIQUETA_ESTADO[c.estado]} · Vence {formatFecha(c.vencimiento)}</p>
        <div className="mt-3">
          <Fila etiqueta="Valor nominal" valor={formatPesos(c.nominal)} />
          <Fila etiqueta="Adelanto del fondo" valor={formatPesos(c.precioCompra)} />
          <Fila etiqueta="Tasa anual (TNA)" valor={formatBps(c.tasaTnaBps)} />
          <Fila etiqueta="Industria" valor={c.industria} nota="Estimada por el agente" />
          <Fila etiqueta="Id del activo" valor={<Copiable texto={c.id}><span className="font-mono">{hashCorto(c.id)}</span></Copiable>} />
          {d.cotizacionHash && <Fila etiqueta="Código de la cotización" nota="Queda registrado on-chain" valor={<Copiable texto={d.cotizacionHash}><span className="font-mono">{hashCorto(d.cotizacionHash)}</span></Copiable>} />}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Puntaje, riesgo y tasa (registrado on-chain)">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl font-semibold tabular-nums">{c.puntaje}/100</span>
          <BandaBadge banda={c.banda} />
          <span className="text-sm text-suave">Riesgo {NIVEL_RIESGO[c.banda].toLowerCase()} · {DESCRIPCION_BANDA[c.banda]}</span>
        </div>
        <p className="mt-2 text-sm text-suave">{c.explicacion}</p>
        <p className="mt-2 text-xs"><Link href="/politicas#puntaje" className={enlace}>¿Cómo se calcula el puntaje y la tasa?</Link></p>
      </Tarjeta>

      <Garantia c={c} informe={informe} />

      {informe ? (
        <>
          <p className="text-xs text-suave">
            Informe del agente analista {origen === "navegador" ? "guardado en este navegador" : "del servidor"} · generado el {formatFecha(informe.generadoEn)}. Verificado contra el código de la cotización registrado on-chain.
          </p>
          <Decision i={informe} />
          <Reglas i={informe} />
          <Emisor i={informe} />
          <ActivoDelInforme i={informe} />
          <AnalisisDelAgente i={informe} />
        </>
      ) : (
        <div role="note" className="rounded-2xl border border-linea-fuerte bg-panel-2 px-4 py-3 text-sm text-suave">{NOTA_SIN_INFORME}</div>
      )}

      <Tarjeta titulo="Historial on-chain">
        {d.historial.length === 0 ? (
          <p className="text-sm text-suave">Todavía no hay transacciones.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {d.historial.map((t) => (
              <li key={t.hash} className="flex flex-wrap items-center justify-between gap-2">
                <span className="capitalize">{t.tipo}</span>
                <LinkBaseScan href={t.url}>{hashCorto(t.hash)} ↗</LinkBaseScan>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

export function DetalleCheque({ id }: { id: string }) {
  const r = useApi<ChequeDetalle>(`/api/cheques/${id}`);
  let cuerpo: ReactNode;
  if (r.estado === "cargando") cuerpo = <Tarjeta><Cargando lineas={5} /></Tarjeta>;
  else if (r.estado === "error") {
    const noExiste = r.codigo === "CHEQUE_INEXISTENTE";
    cuerpo = <ErrorCaja mensaje={noExiste ? MENSAJE_NO_ENCONTRADO : r.mensaje} onReintentar={noExiste ? undefined : r.recargar} />;
  } else cuerpo = <Contenido d={r.datos} />;
  return (
    <div className="space-y-4">
      <Link href="/" className="inline-block text-sm text-enlace hover:underline">← Volver al panel</Link>
      {cuerpo}
    </div>
  );
}
