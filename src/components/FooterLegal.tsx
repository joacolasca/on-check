// Footer legal obligatorio (DECISIONS.md D16). Va en todas las páginas.
export const TEXTO_FOOTER_LEGAL = "Prototipo · el fondo opera en testnet, sin dinero real · no es oferta pública";

export function FooterLegal() {
  return (
    <footer className="border-t border-linea px-4 py-4 text-center text-xs text-suave">
      {TEXTO_FOOTER_LEGAL}
    </footer>
  );
}
