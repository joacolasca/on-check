// Clasificación de industria del emisor. No hay clasificador oficial: la estima el gestor y se muestra "estimada por el agente"
// con su fundamento. Sin modelo: mapa determinístico de los emisores de la demo y, si no, id 0 "Sin clasificar".
import type { IndustriaEstimada } from "@/shared/types";
import industrias from "../../../shared/industrias.json";
import type { Enriquecedor } from "./enriquecedor";
import type { ContextoIndustria } from "./types";

export const INDUSTRIAS: readonly { id: number; nombre: string }[] = industrias;
export const MAX_ID_INDUSTRIA = INDUSTRIAS.length - 1;
export const nombreIndustria = (id: number): string | undefined => INDUSTRIAS.find((i) => i.id === id)?.nombre;

const sinTildes = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();

interface EntradaMapa {
  cuit: string;
  patron: RegExp; // sobre la denominación del BCRA, sin tildes y en mayúsculas
  id: number;
  porque: string;
}

// Emisores de shared/fixtures/cheques-demo.json (CUIT y nombre verificados contra el BCRA el 3-11-2026).
const MAPA_DEMO: EntradaMapa[] = [
  { cuit: "30703088534", patron: /MERCADOLIBRE/, id: 2, porque: "plataforma de comercio electrónico" },
  { cuit: "30548083156", patron: /\bCOTO\b/, id: 1, porque: "cadena de supermercados" },
  { cuit: "30590360763", patron: /CENCOSUD/, id: 1, porque: "cadena de supermercados y tiendas" },
  { cuit: "30639453738", patron: /TELECOM/, id: 3, porque: "empresa de telecomunicaciones" },
  { cuit: "30526552659", patron: /PAMPA ENERGIA/, id: 4, porque: "empresa de energía" },
  { cuit: "30500530851", patron: /LOMA NEGRA/, id: 7, porque: "producción industrial de cemento y cal" },
];

function resultado(id: number, fundamento: string, fuentes: string[], confianza: IndustriaEstimada["confianza"]): IndustriaEstimada {
  return { id, nombre: nombreIndustria(id) ?? "Sin clasificar", fundamento, fuentes, confianza };
}

/** Sin modelo: por CUIT o por la denominación del BCRA, solo para los emisores de la demo. */
export function clasificarIndustriaDeterminista(ctx: ContextoIndustria): IndustriaEstimada {
  const cuit = ctx.cuit.replace(/\D/g, "");
  const nombre = ctx.denominacion ? sinTildes(ctx.denominacion) : "";
  const e = MAPA_DEMO.find((x) => x.cuit === cuit) ?? (nombre ? MAPA_DEMO.find((x) => x.patron.test(nombre)) : undefined);
  const nota = ctx.balance.disponible ? " Se cargó un balance, pero sin el modelo no se usa para clasificar." : "";
  if (e) {
    return resultado(
      e.id,
      `Por la denominación que informa el BCRA (${ctx.denominacion ?? "sin nombre"}): ${e.porque}. Estimación automática para los emisores de la demo, sin revisión de balance.${nota}`,
      ["BCRA", "mapa de emisores de la demo"],
      "media",
    );
  }
  return resultado(
    0,
    `No pude estimar la industria: ${ctx.denominacion ? `la denominación del BCRA (${ctx.denominacion}) no está en el mapa de la demo` : "el BCRA no informa denominación"} y no hay un modelo disponible.${nota}`,
    ctx.denominacion ? ["BCRA"] : [],
    "baja",
  );
}

/** Estima con el modelo si hay enriquecedor; si falla o no responde algo válido, cae al mapa determinístico. */
export async function clasificarIndustria(ctx: ContextoIndustria, enriquecedor?: Enriquecedor): Promise<IndustriaEstimada> {
  if (enriquecedor) {
    try {
      const r = await enriquecedor.clasificarIndustria(ctx);
      if (r) return r;
    } catch {
      // se usa el mapa determinístico
    }
  }
  return clasificarIndustriaDeterminista(ctx);
}
