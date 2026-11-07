// Tests de los componentes de /mandato: HTML estático con datos de shared/fixtures/ui.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActivoBandeja, EvaluacionMandato, Mandato } from "@/shared/types";
import bandeja from "@fixtures/ui/mandato-bandeja.json";
import evals from "@fixtures/ui/mandato-evaluaciones.json";
import type { ItemCorrida } from "@/lib/mandato-ui";
import { InformeFinal } from "./InformeFinal";
import { MandatoForm } from "./MandatoForm";
import { TarjetaActivo } from "./TarjetaActivo";

const PROHIBIDAS = /\b(IA|AI)\b|rinde|rendimiento/;
const activos = bandeja.activos as unknown as ActivoBandeja[];
const E = evals as unknown as Record<string, { evaluacion: EvaluacionMandato; compra: ItemCorrida["compra"]; rechazoContrato: ItemCorrida["rechazoContrato"]; pasos: ItemCorrida["pasos"] }>;
const nada = () => {};

const item = (id: string, resultado: ItemCorrida["resultado"]): ItemCorrida => ({
  id,
  activo: activos.find((a) => a.id === id) as ActivoBandeja,
  reevaluacion: false,
  etapa: "fin",
  pasos: E[id].pasos,
  evaluacion: E[id].evaluacion,
  compra: E[id].compra,
  rechazoContrato: E[id].rechazoContrato,
  resultado,
});

describe("MandatoForm", () => {
  const html = renderToStaticMarkup(
    <MandatoForm mandatoInicial={bandeja.mandatoPorDefecto as unknown as Mandato} activos={activos} simularRebote onSimularRebote={nada} iniciando={false} onIniciar={nada} />,
  );
  it("muestra los valores por defecto, el botón único y el rótulo de simulado", () => {
    expect(html).toContain('value="40000000"');
    expect(html).toContain("Iniciar mandato");
    expect(html).toContain("simulado");
    expect(html).toContain("8 activos");
  });
  it("sin palabras prohibidas", () => expect(html).not.toMatch(PROHIBIDAS));
});

describe("TarjetaActivo", () => {
  it("compró: monto y link a BaseScan", () => {
    const html = renderToStaticMarkup(<TarjetaActivo item={item("ml-1", "compro")} onAprobar={nada} onOmitir={nada} />);
    expect(html).toContain("Compró");
    expect(html).toContain("$ 8.614.000");
    expect(html).toContain("https://sepolia.basescan.org/tx/");
  });
  it("omitió: razones con ✗ abiertas y el texto de cada regla", () => {
    const html = renderToStaticMarkup(<TarjetaActivo item={item("pampa-2", "omitio")} onAprobar={nada} onOmitir={nada} />);
    expect(html).toContain("✗");
    expect(html).toContain("<details open");
    expect(html).toContain("exige 100 %");
  });
  it("el contrato dijo que no: código y mensaje", () => {
    const html = renderToStaticMarkup(<TarjetaActivo item={item("ml-2", "contrato_no")} onAprobar={nada} onOmitir={nada} />);
    expect(html).toContain("El contrato dijo que no");
    expect(html).toContain("CONCENTRACION_EXCEDIDA");
  });
  it("esperando aprobación: botones Aprobar y Omitir", () => {
    const html = renderToStaticMarkup(<TarjetaActivo item={item("ml-1", "esperando_aprobacion")} onAprobar={nada} onOmitir={nada} />);
    expect(html).toContain("Aprobar y comprar");
    expect(html).toContain("Omitir");
  });
});

describe("InformeFinal", () => {
  const compra = E["ml-1"].compra!;
  const html = renderToStaticMarkup(
    <InformeFinal
      informe={{
        mandato: bandeja.mandatoPorDefecto as unknown as Mandato,
        revocado: false,
        antes: { patrimonio: "100000000", liquidezBps: 10000, valorCuotaparte: "1000" },
        despues: null,
        comprados: [compra],
        omitidos: [],
        rechazadosPorContrato: [],
        errores: [],
        rebotes: [],
        invertido: compra.precioCompra,
        disponible: "31386000",
      }}
    />,
  );
  it("muestra antes/después, las compras con link y avisa si falta una foto del fondo", () => {
    expect(html).toContain("Antes: $ 100.000.000");
    expect(html).toContain("no disponible");
    expect(html).toContain("Copiar resumen");
    expect(html).toContain("https://sepolia.basescan.org/tx/");
    expect(html).toContain("comparación queda incompleta");
  });
  it("sin palabras prohibidas", () => expect(html).not.toMatch(PROHIBIDAS));
});
