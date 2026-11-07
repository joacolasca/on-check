"use client";
import Link from "next/link";
import type { ArgtReal, ChequeVista, ResumenFondo } from "@/shared/types";
import { useApi } from "@/lib/use-api";
import { formatBps, formatDecimal, formatPesos, unidadesADecimal, urlDireccionMainnet, urlDireccionSepolia } from "@/lib/format";
import { notaTir } from "@/lib/panel";
import { escalaBarra } from "@/lib/reglas";
import { formatPuntajeCentesimas, metricasCartera, textosRentabilidad } from "@/lib/rentabilidad";
import { Cargando, Copiable, ErrorCaja, LinkBaseScan, Metrica, Tarjeta } from "./ui";
import { ReglasFondo } from "./ReglasFondo";
import { TablaCartera } from "./TablaCartera";
import { TortasFondo } from "./TortasFondo";
import { Portada } from "./Portada";

type Icono = (p: { className?: string }) => React.ReactElement;
const svg = (children: React.ReactNode): Icono =>
  function IconoSvg({ className }) {
    return (
      <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    );
  };

const IconoMas = svg(<path d="M12 5v14M5 12h14" />);
const IconoFlecha = svg(<path d="M12 5v14M6 13l6 6 6-6" />);
const IconoPlay = svg(<path d="M7 4l13 8-13 8z" />);
const IconoExterno = svg(<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />);

function Accion({ href, etiqueta, icono: Icono, externa }: { href: string; etiqueta: string; icono: Icono; externa?: boolean }) {
  const interior = (
    <>
      <Icono className="h-6 w-6" />
      <span className="text-xs font-medium">{etiqueta}</span>
    </>
  );
  const clase = "flex flex-col items-center gap-2 rounded-2xl bg-panel-2 px-2 py-4 text-center transition hover:bg-linea active:scale-[0.98]";
  return externa ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={clase}>{interior}</a>
  ) : (
    <Link href={href} className={clase}>{interior}</Link>
  );
}

/** Liquidez frente al mínimo de la política: la marca vertical es el piso. */
function BarraLiquidez({ f }: { f: ResumenFondo }) {
  const { rellenoPct, marcaPct } = escalaBarra(f.liquidezBps, f.politica.liquidezMinBps);
  return (
    <div className="mx-auto mt-5 max-w-sm text-left">
      <div
        className="relative h-2.5 rounded-full bg-linea"
        role="progressbar"
        aria-label={`Liquidez ${formatBps(f.liquidezBps)} del patrimonio; mínimo ${formatBps(f.politica.liquidezMinBps)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(rellenoPct))}
      >
        <div className="h-full rounded-full bg-acento" style={{ width: `${Math.min(100, rellenoPct)}%` }} />
        <div aria-hidden className="absolute -top-1 h-4.5 w-0.5 rounded bg-texto" style={{ left: `${marcaPct}%` }} />
      </div>
      <p className="mt-2 text-xs text-suave">
        Liquidez {formatBps(f.liquidezBps)} del patrimonio · mínimo {formatBps(f.politica.liquidezMinBps)} (marca vertical)
      </p>
    </div>
  );
}

export function ResumenFondoVista({ f }: { f: ResumenFondo }) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-linea bg-panel px-4 py-7 text-center">
        <p className="text-sm text-suave">Patrimonio del fondo</p>
        <p className="mt-1 whitespace-nowrap text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{formatPesos(f.totalAssets)}</p>
        <p className="mt-1 text-sm text-suave">
          Cuotaparte {formatPesos(f.valorCuotaparte)} · parte de {formatPesos(f.politica.precioInicialCuotaparte)}
        </p>
        <BarraLiquidez f={f} />
        <div className="mt-6 grid grid-cols-4 gap-2 sm:gap-3">
          <Accion href="/pyme" etiqueta="Cargar activo" icono={IconoMas} />
          <Accion href="/invertir" etiqueta="Invertir" icono={IconoFlecha} />
          <Accion href="/plan" etiqueta="Plan automático" icono={IconoPlay} />
          <Accion href={urlDireccionSepolia(f.direccionContrato)} etiqueta="Contrato" icono={IconoExterno} externa />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metrica etiqueta="Valor de la cuotaparte" valor={formatPesos(f.valorCuotaparte)} nota={`${formatDecimal(f.cuotapartesEmitidas, 4)} emitidas`} />
        <Metrica etiqueta="Liquidez" valor={formatPesos(f.liquidez)} nota={`${formatBps(f.liquidezBps)} del patrimonio · mínimo ${formatBps(f.politica.liquidezMinBps)}`} />
        <Metrica
          etiqueta="Comisión devengada"
          valor={formatPesos(f.comision.devengadaPesos)}
          nota={`${formatBps(f.politica.comisionAnualBps)} anual, día a día · ${formatDecimal(f.comision.devengadaCuotapartes, 4)} cuotapartes`}
        />
        <Metrica etiqueta="Objetivo" valor={`${formatBps(f.politica.objetivoTnaBps)} TNA`} nota="Objetivo, no garantizado" />
        <Metrica etiqueta="Rescates pendientes" valor={f.rescatesPendientes} nota="Se liquidan a 24 horas hábiles" />
        <Metrica etiqueta="Rechazos" valor={f.rechazos.cantidad} nota={f.rechazos.cantidad > 0 ? `Pérdida: ${formatPesos(f.rechazos.perdida)}` : "Sin pérdidas"} />
        <Metrica etiqueta="TIR anualizada" valor={f.tirAnualizadaBps === null ? "—" : formatBps(f.tirAnualizadaBps)} nota={notaTir(f.tirAnualizadaBps)} />
        <Metrica
          etiqueta="Activos"
          valor={Object.values(f.cantidadCheques).reduce((a, b) => a + b, 0)}
          nota={`${f.cantidadCheques.Pending} pend. · ${f.cantidadCheques.Funded} fond. · ${f.cantidadCheques.Paid} pagados · ${f.cantidadCheques.Rejected} rech.`}
        />
      </div>

      <p className="break-all text-xs text-suave">
        Contrato en Base Sepolia: <Copiable texto={f.direccionContrato}><LinkBaseScan href={urlDireccionSepolia(f.direccionContrato)}>{f.direccionContrato}</LinkBaseScan></Copiable>
      </p>
    </div>
  );
}

/** Puntaje y tasa ponderados por capital de los activos vigentes, y tasa neta estimada (bruta − comisión) frente al objetivo. */
function MetricasPonderadas({ f }: { f: ResumenFondo }) {
  const r = useApi<ChequeVista[]>("/api/cheques");
  if (r.estado === "cargando") return <Cargando lineas={2} />;
  const T = textosRentabilidad(f.politica, formatBps);
  const m = r.estado === "listo" ? metricasCartera(r.datos, f.politica) : null;
  const sinDato = r.estado === "error" ? "No pudimos leer la cartera" : T.sinActivos;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Metrica etiqueta={T.puntajeEtiqueta} valor={m ? formatPuntajeCentesimas(m.puntajePromedioCentesimas) : "—"} nota={m ? T.puntajeNota : sinDato} />
      <Metrica etiqueta={T.brutaEtiqueta} valor={m ? formatBps(m.tasaBrutaBps) : "—"} nota={m ? T.brutaNota : sinDato} />
      <Metrica className="col-span-2 md:col-span-1" etiqueta={T.netaEtiqueta} valor={m ? formatBps(m.tasaNetaEstimadaBps) : "—"} nota={m ? `${T.netaNota}. ${T.netaAviso}` : sinDato} />
    </div>
  );
}

function ArgtSeccion() {
  const r = useApi<ArgtReal>("/api/argt-real");
  if (r.estado === "cargando") return <Cargando lineas={2} />;
  if (r.estado === "error") return <ErrorCaja mensaje={r.mensaje} onReintentar={r.recargar} />;
  const a = r.datos;
  return (
    <div className="space-y-2 text-sm">
      <p>
        En circulación: <span className="font-mono tabular-nums">{formatDecimal(unidadesADecimal(a.totalSupply), 2)} ARGt</span>
      </p>
      <p className="break-all">
        Contrato: <Copiable texto={a.direccion}><LinkBaseScan href={urlDireccionMainnet(a.direccion)}>{a.direccion}</LinkBaseScan></Copiable>
      </p>
    </div>
  );
}

function CarteraSeccion() {
  const r = useApi<ChequeVista[]>("/api/cheques");
  if (r.estado === "cargando") return <Cargando lineas={4} />;
  if (r.estado === "error") return <ErrorCaja mensaje={r.mensaje} onReintentar={r.recargar} />;
  return <TablaCartera cheques={r.datos} />;
}

export function PanelPublico() {
  const fondo = useApi<ResumenFondo>("/api/fondo");
  return (
    <div className="space-y-5">
      <h1 className="sr-only">Panel público del fondo</h1>
      {fondo.estado === "cargando" && <Cargando lineas={3} />}
      {fondo.estado === "error" && <ErrorCaja mensaje={fondo.mensaje} onReintentar={fondo.recargar} />}
      {fondo.estado === "listo" && (
        <>
          <ResumenFondoVista f={fondo.datos} />
          <Portada direccionFondo={fondo.datos.direccionContrato} />
          <MetricasPonderadas f={fondo.datos} />
          <Tarjeta titulo="Composición de la cartera"><TortasFondo composicion={fondo.datos.composicion} /></Tarjeta>
          <Tarjeta titulo="Reglas del fondo"><ReglasFondo fondo={fondo.datos} /></Tarjeta>
        </>
      )}
      <Tarjeta titulo="Cartera: cheques y pagarés"><CarteraSeccion /></Tarjeta>
      <Tarjeta titulo="ARGt de Twin en Base mainnet"><ArgtSeccion /></Tarjeta>
    </div>
  );
}
