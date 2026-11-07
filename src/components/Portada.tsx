// Fila compacta de evidencia onchain: un link por red, sin texto de presentación.
import { hashCorto, urlDireccionSepolia } from "@/lib/format";
import { ARBISCAN } from "@/lib/argt-real";
import { FUJI, SNOWTRACE_FUJI } from "@/lib/avalanche";

export const TX_ARGT_REAL = "0xd2d1a142027dd4ebdbadac7aefe833c24bc790c4a28bd9443e4fea21128429a9";

function Chip({ red, que, href, real }: { red: string; que: string; href: string; real?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 rounded-xl border border-linea bg-panel px-3 py-2 text-sm transition hover:border-linea-fuerte">
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${real ? "bg-acento" : "bg-linea-fuerte"}`} />
      <span className="shrink-0 text-suave">{red}</span>
      <span className="truncate font-mono text-xs">{que}</span>
      <span aria-hidden className="text-suave">↗</span>
    </a>
  );
}

export function Portada({ direccionFondo }: { direccionFondo?: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" aria-label="Evidencia onchain">
      <Chip red="Arbitrum" que={`10 ARGt · ${hashCorto(TX_ARGT_REAL, 4)}`} href={`${ARBISCAN}/tx/${TX_ARGT_REAL}`} real />
      <Chip red="Base Sepolia" que={direccionFondo ? hashCorto(direccionFondo, 4) : "fondo"} href={direccionFondo ? urlDireccionSepolia(direccionFondo) : "/politicas"} />
      <Chip red="Avalanche Fuji" que={hashCorto(FUJI.chequeFund, 4)} href={`${SNOWTRACE_FUJI}/address/${FUJI.chequeFund}`} />
    </div>
  );
}
