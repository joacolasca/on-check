// Portada del panel: qué es onCheck en una frase, los tres caminos y la evidencia onchain verificable.
import Link from "next/link";
import { hashCorto, urlDireccionSepolia } from "@/lib/format";
import { ARBISCAN, ARGT_ARBITRUM } from "@/lib/argt-real";
import { FUJI, SNOWTRACE_FUJI } from "@/lib/avalanche";

export const TX_ARGT_REAL = "0xd2d1a142027dd4ebdbadac7aefe833c24bc790c4a28bd9443e4fea21128429a9";

const CAMINOS = [
  { href: "/pyme", quien: "Pyme", titulo: "Cobrá hoy tu cheque o pagaré", texto: "Te decimos cuánto te adelantamos y por qué. Miramos a quien paga, no a quien vende." },
  { href: "/invertir", quien: "Inversor", titulo: "Comprá cuotapartes del fondo", texto: "Ves cada activo, cada cobro y cada rechazo. El valor de la cuotaparte es público." },
  { href: "/mandato", quien: "Mandato", titulo: "Un agente invierte con tus reglas", texto: "Fijás presupuesto, riesgo y topes una vez. Compra lo que cumple y explica lo que omite." },
] as const;

function Flecha() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition group-hover:translate-x-0.5">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Evidencia({ red, que, href, detalle, real }: { red: string; que: string; href: string; detalle: string; real?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="group flex min-w-0 flex-col gap-1 rounded-xl border border-linea bg-panel-2 px-3 py-2.5 transition hover:border-linea-fuerte">
      <span className="flex items-center gap-2 text-xs text-suave">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${real ? "bg-acento" : "bg-linea-fuerte"}`} />
        {red} · {real ? "mainnet" : "testnet"}
      </span>
      <span className="text-sm font-medium">{que} ↗</span>
      <span className="truncate font-mono text-xs text-suave">{detalle}</span>
    </a>
  );
}

export function Portada({ direccionFondo }: { direccionFondo?: string }) {
  return (
    <section aria-labelledby="portada-titulo" className="space-y-5">
      <div className="space-y-3 pt-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-suave">onCheck · fondo de cheques y pagarés</p>
        <h1 id="portada-titulo" className="text-4xl font-semibold tracking-tight sm:text-5xl">
          El cheque, <span className="text-acento">a la vista.</span>
        </h1>
        <p className="max-w-2xl text-base text-suave sm:text-lg">
          Las pymes cobran hoy lo que les pagan a 90 días. Los inversores ven en qué está cada peso. Cada cheque y cada pagaré es un registro público, y los límites de riesgo los hace cumplir el contrato, no una promesa.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {CAMINOS.map((c) => (
          <Link key={c.href} href={c.href} className="group flex flex-col gap-2 rounded-2xl border border-linea bg-panel p-4 transition hover:border-linea-fuerte active:scale-[0.99]">
            <span className="text-xs font-medium uppercase tracking-wider text-suave">{c.quien}</span>
            <span className="flex items-center justify-between gap-2 font-semibold">
              {c.titulo}
              <Flecha />
            </span>
            <span className="text-sm text-suave">{c.texto}</span>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-linea bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Verificable onchain</h2>
          <p className="text-xs text-suave">El fondo corre en testnet para mostrar cada regla sin arriesgar plata. El pago con ARGt es real.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Evidencia red="Arbitrum One" que="Pago de un cheque con ARGt de Twin" href={`${ARBISCAN}/tx/${TX_ARGT_REAL}`} detalle={`10 ARGt · ${hashCorto(TX_ARGT_REAL, 6)}`} real />
          <Evidencia
            red="Base Sepolia"
            que="Contrato del fondo y sus reglas"
            href={direccionFondo ? urlDireccionSepolia(direccionFondo) : "/politicas"}
            detalle={direccionFondo ? hashCorto(direccionFondo, 6) : "10 % emisor · 25 % industria · 15 % liquidez"}
          />
          <Evidencia red="Avalanche Fuji" que="Mismo fondo, verificado en Snowtrace" href={`${SNOWTRACE_FUJI}/address/${FUJI.chequeFund}`} detalle={hashCorto(FUJI.chequeFund, 6)} />
        </div>
        <p className="mt-3 text-xs text-suave">
          Token ARGt en Arbitrum: <span className="font-mono">{hashCorto(ARGT_ARBITRUM, 6)}</span> ·{" "}
          <Link href="/argt-real" className="underline underline-offset-2">pagar un cheque con ARGt real</Link> ·{" "}
          <Link href="/avalanche" className="underline underline-offset-2">operar el fondo en Avalanche</Link>
        </p>
      </div>
    </section>
  );
}
