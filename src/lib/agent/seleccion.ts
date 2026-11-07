// Elige el analista según las claves disponibles:
//   OPENROUTER_API_KEY → Claude vía OpenRouter (Haiku 5.5 por defecto)
//   ANTHROPIC_API_KEY  → Claude directo (Sonnet 5.5 por defecto)
//   ninguna (o AGENT_MODE=determinista) → analista determinístico, gratis.
import Anthropic from "@anthropic-ai/sdk";
import { analistaDeterminista } from "./analista-determinista";
import { MODELO_OPENROUTER_POR_DEFECTO, MODELO_POR_DEFECTO, crearAnalistaLlm, crearClienteOpenRouter } from "./analista-llm";
import { crearEnriquecedorLlm } from "./enriquecedor";
import { herramientasPorDefecto } from "./herramientas";
import type { Analista, Herramientas } from "./types";

export type Proveedor = "openrouter" | "anthropic" | "ninguno";

export function proveedorActivo(): Proveedor {
  if (process.env.AGENT_MODE === "determinista") return "ninguno";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "ninguno";
}

export const hayClaveDeModelo = (): boolean => proveedorActivo() !== "ninguno";

/** Un analista nuevo por análisis (el de Claude guarda la conversación). */
export function seleccionarAnalista(): Analista {
  const proveedor = proveedorActivo();
  if (proveedor === "openrouter") {
    return crearAnalistaLlm({
      cliente: crearClienteOpenRouter(process.env.OPENROUTER_API_KEY ?? ""),
      modelo: process.env.AGENT_MODEL || MODELO_OPENROUTER_POR_DEFECTO,
    });
  }
  return proveedor === "anthropic" ? crearAnalistaLlm() : analistaDeterminista;
}

/**
 * Herramientas con el modelo para estimar la industria y enriquecer la garantía (si hay clave). Si el modelo falla en una de esas
 * tareas, queda el resultado determinístico. Con AGENT_WEB_RESEARCH=1 y OpenRouter, la industria se clasifica con búsqueda web (":online").
 */
export function seleccionarHerramientas(): Herramientas {
  const proveedor = proveedorActivo();
  if (proveedor === "openrouter") {
    const enriquecedor = crearEnriquecedorLlm({
      cliente: crearClienteOpenRouter(process.env.OPENROUTER_API_KEY ?? ""),
      modelo: process.env.AGENT_MODEL || MODELO_OPENROUTER_POR_DEFECTO,
      busquedaWeb: process.env.AGENT_WEB_RESEARCH === "1",
    });
    return herramientasPorDefecto({ enriquecedor });
  }
  if (proveedor === "anthropic") {
    // El sufijo ":online" es de OpenRouter: con la API directa no hay búsqueda web.
    const enriquecedor = crearEnriquecedorLlm({ cliente: new Anthropic({ maxRetries: 0, timeout: 20_000 }), modelo: process.env.AGENT_MODEL || MODELO_POR_DEFECTO, busquedaWeb: false });
    return herramientasPorDefecto({ enriquecedor });
  }
  return herramientasPorDefecto();
}

/** Con modelo hay varias idas y vueltas (y dos consultas puntuales): más margen que los 30 s del bucle por defecto. La ruta corta a los 60 s. */
export const timeoutDelAnalista = (a: Analista): number => (a.modo === "agente" ? 52_000 : 30_000);
