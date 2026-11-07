// Copias de las respuestas reales del BCRA para los CUITs de demo (shared/fixtures/bcra/{cuit}.json).
// Mapa explícito para que el bundler las incluya; hay un test que verifica que no falte ninguna.
const CARGADORES: Record<string, () => Promise<{ default: unknown }>> = {
  "30703088534": () => import("@fixtures/bcra/30703088534.json"), // MercadoLibre
  "30548083156": () => import("@fixtures/bcra/30548083156.json"), // Coto
  "30590360763": () => import("@fixtures/bcra/30590360763.json"), // Cencosud
  "30526552659": () => import("@fixtures/bcra/30526552659.json"), // Pampa Energía
  "30639453738": () => import("@fixtures/bcra/30639453738.json"), // Telecom Argentina
  "30500530851": () => import("@fixtures/bcra/30500530851.json"), // Loma Negra (suplente)
};

export const CUITS_EN_CACHE = Object.keys(CARGADORES);

export interface CopiaBcra {
  cuit: string;
  consultadoEn: string;
  deudas: unknown;
  historicas: unknown;
  chequesRechazados: unknown | null;
}

export async function leerCopia(cuit: string): Promise<CopiaBcra | null> {
  const cargar = CARGADORES[cuit];
  if (!cargar) return null;
  return (await cargar()).default as CopiaBcra;
}
