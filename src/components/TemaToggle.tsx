"use client";
import { useSyncExternalStore } from "react";

type Tema = "claro" | "oscuro";
const CLAVE = "fondo-cheques:tema";
const EVENTO = "fondo-cheques:tema-cambio";

function suscribir(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(EVENTO, cb);
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    mq.removeEventListener("change", cb);
  };
}

function temaActual(): Tema {
  const fijo = document.documentElement.dataset.tema;
  if (fijo === "claro" || fijo === "oscuro") return fijo;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
}

export function TemaToggle() {
  const tema = useSyncExternalStore(suscribir, temaActual, (): Tema => "claro");
  function alternar() {
    const nuevo: Tema = tema === "oscuro" ? "claro" : "oscuro";
    document.documentElement.dataset.tema = nuevo;
    try {
      localStorage.setItem(CLAVE, nuevo);
    } catch {
      // sin storage: el cambio dura hasta recargar
    }
    window.dispatchEvent(new Event(EVENTO));
  }
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={tema === "oscuro" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      className="flex h-9 w-9 items-center justify-center rounded-full text-suave hover:bg-linea/50 hover:text-texto"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {tema === "oscuro" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}
