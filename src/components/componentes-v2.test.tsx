// Tests de componentes de la v2: se renderizan a HTML estático con datos de shared/fixtures/ui.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChequeVista, Cotizacion, RescateVista, ResumenFondo } from "@/shared/types";
import chequesJson from "@fixtures/ui/cheques.json";
import cotJson from "@fixtures/ui/cotizacion-pagare.json";
import fondoJson from "@fixtures/ui/fondo.json";
import rescatesJson from "@fixtures/ui/rescates.json";
import { armarPorciones } from "@/lib/torta";
import { ResumenFondoVista } from "./PanelPublico";
import { ReglasFondo } from "./ReglasFondo";
import { AnalisisGarantia, ConsultaMav, DecisionGestor, IndustriaEstimada } from "./ResultadoPM";
import { TablaCartera } from "./TablaCartera";
import { TablaRescates } from "./TablaRescates";
import { Torta } from "./Torta";

const fondo = fondoJson as unknown as ResumenFondo;
const cheques = chequesJson as unknown as ChequeVista[];
const cot = cotJson as unknown as Cotizacion;
const rescates = rescatesJson as unknown as RescateVista[];

const PROHIBIDAS = /\b(IA|AI)\b|rinde|rendimiento/;

describe("Torta", () => {
  const porciones = armarPorciones(fondo.composicion.porEmisor);
  const html = renderToStaticMarkup(<Torta porciones={porciones} titulo="Cartera por emisor" />);
  it("tiene descripción accesible con los porcentajes", () => {
    expect(html).toContain('role="img"');
    expect(html).toMatch(/<title[^>]*>Cartera por emisor: PAMPA ENERGIA S A 16,1 %/);
  });
  it("la leyenda muestra monto y porcentaje de cada porción, en botones", () => {
    expect(html).toContain("$ 9.500.000");
    expect(html).toContain("16,1 %");
    expect(html).toContain("Otros (4)");
    expect((html.match(/aria-pressed/g) ?? []).length).toBe(porciones.length);
  });
  it("los colores salen de los tokens, no de valores fijos", () => {
    expect(html).toContain("var(--serie-1)");
    expect(html).not.toMatch(/fill="#/);
  });
  it("sin datos muestra el mensaje en lugar de un gráfico vacío", () => {
    expect(renderToStaticMarkup(<Torta porciones={[]} titulo="x" vacio="Todavía no hay datos." />)).toContain("Todavía no hay datos.");
  });
  it("una sola porción (100 %) se dibuja como anillo completo", () => {
    const h = renderToStaticMarkup(<Torta porciones={armarPorciones([{ clave: "a", etiqueta: "A", monto: "10", bps: 10000 }])} titulo="x" />);
    expect(h).toContain("100 %");
    expect(h).toContain('fill-rule="evenodd"');
  });
});

describe("Panel", () => {
  const html = renderToStaticMarkup(<ResumenFondoVista f={fondo} />);
  it("muestra patrimonio, cuotaparte desde $ 1.000, liquidez y mínimo", () => {
    expect(html).toContain("$ 100.000.000");
    expect(html).toContain("parte de $ 1.000");
    expect(html).toContain("mínimo 15 %");
  });
  it("rotula el objetivo como no garantizado", () => {
    expect(html).toContain("40 % TNA");
    expect(html).toContain("Objetivo, no garantizado");
  });
  it("no usa palabras prohibidas", () => {
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(PROHIBIDAS);
  });
});

describe("ReglasFondo", () => {
  const html = renderToStaticMarkup(<ReglasFondo fondo={fondo} />);
  it("muestra cada límite con su consumo actual", () => {
    expect(html).toContain("Máximo por emisor");
    expect(html).toContain("tope 10 %");
    expect(html).toContain("9,5 %");
    expect(html).toContain("tope 25 %");
    expect(html).toContain("mínimo 15 %");
    expect(html).toContain("24 horas hábiles");
    expect(html).toContain("3 % anual");
  });
  it("las barras son progressbar con nombre", () => {
    expect((html.match(/role="progressbar"/g) ?? []).length).toBe(3);
    expect(html).toContain("aria-label=\"Máximo por emisor: hoy 9,5 %, tope 10 %\"");
  });
  it("no usa palabras prohibidas", () => {
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(PROHIBIDAS);
  });
});

describe("TablaCartera", () => {
  const html = renderToStaticMarkup(<TablaCartera cheques={cheques} />);
  it("lista tipo, emisor y estado; usa el hash corto si no hay nombre", () => {
    expect(html).toContain("Pagaré");
    expect(html).toContain("MERCADOLIBRE S.R.L.");
    expect(html).toContain("0xc2d9…71ab");
    expect(html).toContain("Rechazado");
  });
  it("cada fila se abre con un botón accesible", () => {
    expect((html.match(/aria-expanded="false"/g) ?? []).length).toBe(cheques.length);
  });
  it("sin activos explica qué hacer", () => {
    expect(renderToStaticMarkup(<TablaCartera cheques={[]} />)).toContain("Todavía no hay cheques ni pagarés");
  });
});

describe("Resultado del gestor", () => {
  it("muestra la decisión con sus condiciones", () => {
    const h = renderToStaticMarkup(<DecisionGestor cot={cot} />);
    expect(h).toContain("El gestor aprueba con condiciones");
    expect(h).toContain("Firmar la prenda");
  });
  it("la industria dice que la estimó el agente, con fundamento y confianza", () => {
    const h = renderToStaticMarkup(<IndustriaEstimada cot={cot} />);
    expect(h).toContain("estimada por el agente");
    expect(h).toContain("Confianza media");
    expect(h).toContain("balance cargado");
  });
  it("el MAV está rotulado como simulado", () => {
    expect(renderToStaticMarkup(<ConsultaMav cot={cot} />)).toContain("MAV (simulado)");
  });
  it("la garantía muestra descuento, valor ajustado, cobertura, riesgos, pendientes y el aviso de la prenda", () => {
    const h = renderToStaticMarkup(<AnalisisGarantia cot={cot} />);
    expect(h).toContain("45 %");
    expect(h).toContain("$ 6.600.000");
    expect(h).toContain("67,35 %");
    expect(h).toContain("Liquidez baja");
    expect(h).toContain("Documentos pendientes");
    expect(h).toContain("La prenda legal se firma después");
  });
  it("sin garantía ni MAV no dibuja esas cajas", () => {
    const sin = { ...cot, garantia: undefined, mav: undefined, decisionPM: undefined };
    expect(renderToStaticMarkup(<AnalisisGarantia cot={sin} />)).toBe("");
    expect(renderToStaticMarkup(<ConsultaMav cot={sin} />)).toBe("");
    expect(renderToStaticMarkup(<DecisionGestor cot={sin} />)).toBe("");
  });
  it("no usa palabras prohibidas", () => {
    const h = [DecisionGestor, IndustriaEstimada, ConsultaMav, AnalisisGarantia].map((C) => renderToStaticMarkup(<C cot={cot} />)).join(" ");
    expect(h.replace(/<[^>]+>/g, " ")).not.toMatch(PROHIBIDAS);
  });
});

describe("TablaRescates", () => {
  const html = renderToStaticMarkup(<TablaRescates rescates={rescates} />);
  it("muestra estado y fecha de liquidación en hora de Buenos Aires", () => {
    expect(html).toContain("Pendiente");
    expect(html).toContain("Liquidado");
    expect(html).toContain("sábado 7/11/2026");
    expect(html).toContain("Pagado: $ 1.004.820");
  });
  it("sin rescates muestra el mensaje", () => {
    expect(renderToStaticMarkup(<TablaRescates rescates={[]} vacio="No hay." />)).toContain("No hay.");
  });
});
