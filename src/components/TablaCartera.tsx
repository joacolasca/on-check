"use client";
import Link from "next/link";
import { Fragment, useState } from "react";
import type { ChequeVista } from "@/shared/types";
import { NOMBRE_GARANTIA, NOMBRE_TIPO } from "@/lib/cotizacion";
import { rutaDetalle } from "@/lib/detalle-vista";
import { formatBps, formatFecha, formatPesos } from "@/lib/format";
import { FILTROS, contarPorFiltro, filtrarCheques, type FiltroCheques } from "@/lib/panel";
import { BandaBadge, Chip, EstadoBadge, LinkBaseScan } from "./ui";

const textoGarantia = (c: ChequeVista): string => (c.garantia ? `${NOMBRE_GARANTIA[c.garantia.tipo]} · cobertura ${formatBps(c.garantia.coberturaBps)}` : "Sin garantía");

function Detalle({ c }: { c: ChequeVista }) {
  return (
    <div className="space-y-2 rounded-2xl bg-panel-2 p-3 text-sm">
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div><dt className="inline text-suave">Industria: </dt><dd className="inline">{c.industria}</dd></div>
        <div><dt className="inline text-suave">Garantía: </dt><dd className="inline">{textoGarantia(c)}</dd></div>
        <div><dt className="inline text-suave">Vence: </dt><dd className="inline">{formatFecha(c.vencimiento)}</dd></div>
        <div><dt className="inline text-suave">Adelanto: </dt><dd className="inline tabular-nums">{formatPesos(c.precioCompra)}</dd></div>
      </dl>
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-suave">Riesgo</span>
        <span className="font-mono">{c.puntaje}/100</span>
        <BandaBadge banda={c.banda} />
        <span className="text-suave">· Tasa</span>
        <span className="font-mono">{formatBps(c.tasaTnaBps)}</span>
      </p>
      <p className="text-suave">{c.explicacion}</p>
      <p className="flex flex-wrap gap-x-4 text-xs">
        <Link href="/politicas#puntaje" className="text-enlace underline-offset-2 hover:underline">¿Cómo se calcula el puntaje y la tasa?</Link>
        {c.garantia ? <Link href="/politicas#garantias" className="text-enlace underline-offset-2 hover:underline">Qué es la cobertura de la garantía</Link> : null}
      </p>
      <p className="text-xs"><Link href={rutaDetalle(c.id)} className="text-enlace underline-offset-2 hover:underline">Ver detalle completo →</Link></p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {c.txs.map((t) => (
          <li key={t.hash}><LinkBaseScan href={t.url}>{t.tipo} en BaseScan ↗</LinkBaseScan></li>
        ))}
      </ul>
    </div>
  );
}

/** Tabla de cartera con filtros de estado; cada fila se abre para ver el detalle y los links a BaseScan. */
export function TablaCartera({ cheques }: { cheques: ChequeVista[] }) {
  const [filtro, setFiltro] = useState<FiltroCheques>("todos");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  if (cheques.length === 0) {
    return <p className="text-sm text-suave">Todavía no hay cheques ni pagarés. Cargá el primero desde la sección Pyme.</p>;
  }
  const conteo = contarPorFiltro(cheques);
  const visibles = filtrarCheques(cheques, filtro);
  const alternar = (id: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <div role="group" aria-label="Filtrar por estado" className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTROS.map((f) => (
          <Chip key={f.id} activo={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.etiqueta} <span className="tabular-nums opacity-70">{conteo[f.id]}</span>
          </Chip>
        ))}
      </div>
      {visibles.length === 0 ? (
        <p className="py-4 text-sm text-suave">No hay activos en este estado.</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">Cartera del fondo: cheques y pagarés</caption>
          <thead>
            <tr className="border-b border-linea text-left text-xs text-suave">
              <th scope="col" className="py-2 pr-2 font-medium">Emisor</th>
              <th scope="col" className="hidden w-[22%] px-2 font-medium lg:table-cell">Industria</th>
              <th scope="col" className="hidden w-[20%] px-2 font-medium md:table-cell">Garantía</th>
              <th scope="col" className="w-[7.5rem] px-2 text-right font-medium sm:w-[20%]">Nominal</th>
              <th scope="col" className="hidden w-[16%] pl-2 font-medium sm:table-cell">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => {
              const abierto = abiertos.has(c.id);
              return (
                <Fragment key={c.id}>
                  <tr className="border-b border-linea align-top">
                    <td className="py-3 pr-2">
                      <button
                        type="button"
                        aria-expanded={abierto}
                        aria-controls={`det-${c.id}`}
                        onClick={() => alternar(c.id)}
                        className="-ml-1 w-full rounded-lg px-1 text-left hover:bg-panel-2"
                      >
                        <span className="mr-2 inline-block rounded-full border border-linea-fuerte px-2 py-0.5 text-xs">{NOMBRE_TIPO[c.tipo]}</span>
                        <span className="block break-words font-medium sm:inline">{c.emisorNombre ?? c.libradorHashCorto}</span>
                        <span className="block text-xs text-suave lg:hidden">{c.industria}</span>
                      </button>
                      <span className="mt-1 block sm:hidden"><EstadoBadge estado={c.estado} /></span>
                    </td>
                    <td className="hidden px-2 py-3 text-suave lg:table-cell">{c.industria}</td>
                    <td className="hidden px-2 py-3 md:table-cell">{textoGarantia(c)}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">{formatPesos(c.nominal)}</td>
                    <td className="hidden py-3 pl-2 sm:table-cell"><EstadoBadge estado={c.estado} /></td>
                  </tr>
                  {abierto && (
                    <tr id={`det-${c.id}`} className="border-b border-linea">
                      <td colSpan={5} className="py-3 pr-2"><Detalle c={c} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
