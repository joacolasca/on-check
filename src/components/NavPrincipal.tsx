"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TemaToggle } from "./TemaToggle";

const LINKS = [
  { href: "/", texto: "Panel" },
  { href: "/pyme", texto: "Pyme" },
  { href: "/invertir", texto: "Invertir" },
  { href: "/mandato", texto: "Mandato" },
  { href: "/politicas", texto: "Políticas" },
  { href: "/argt-real", texto: "ARGt real" },
  { href: "/avalanche", texto: "Avalanche" },
  { href: "/demo", texto: "Demo" },
];

function Marca() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="var(--primario)" />
      <rect x="7" y="9" width="14" height="4" rx="2" fill="var(--sobre-primario)" opacity="0.55" />
      <rect x="11" y="15" width="14" height="4" rx="2" fill="var(--sobre-primario)" />
      <rect x="7" y="21" width="9" height="3" rx="1.5" fill="var(--sobre-primario)" opacity="0.55" />
    </svg>
  );
}

export function NavPrincipal() {
  const ruta = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-linea bg-panel">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label="On-Chain, inicio">
          <Marca />
          <span className="font-semibold tracking-tight">On-Chain</span>
        </Link>
        <Link href="/argt-real" title="El fondo corre en testnet con ARGt simulado. El pago con ARGt real está en Arbitrum." className="flex items-center gap-2 rounded-full border border-linea-fuerte px-3 py-1.5 text-sm">
          <span aria-hidden className="h-2 w-2 rounded-full bg-acento" />
          <span className="hidden sm:inline">Fondo en testnet · ARGt real en Arbitrum</span>
          <span className="sm:hidden">Testnet · ARGt real</span>
        </Link>
        <TemaToggle />
      </div>
      <nav aria-label="Principal" className="mx-auto flex max-w-4xl overflow-x-auto px-4 text-sm">
        {LINKS.map((l) => {
          const activo = l.href === "/" ? ruta === "/" : ruta.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={activo ? "page" : undefined}
              className={`flex-1 whitespace-nowrap border-b-2 px-2 py-3 text-center font-medium ${activo ? "border-texto text-texto" : "border-transparent text-suave hover:text-texto"}`}
            >
              {l.texto}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
