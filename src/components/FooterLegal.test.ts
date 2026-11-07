import { describe, expect, it } from "vitest";
import { TEXTO_FOOTER_LEGAL } from "./FooterLegal";

describe("footer legal", () => {
  it("tiene el texto obligatorio y nunca dice que ARGt rinde", () => {
    expect(TEXTO_FOOTER_LEGAL).toBe("Prototipo · el fondo opera en testnet, sin dinero real · no es oferta pública");
    expect(TEXTO_FOOTER_LEGAL).not.toMatch(/rinde|rendimiento garantizado/i);
  });
});
