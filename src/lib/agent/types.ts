// Tipos del gestor (PM) del fondo. Spec: docs/V2-SPEC.md ("Agente gestor (PM)"). El gestor solo ASESORA: ninguna herramienta mueve fondos.
import type {
  Cotizacion,
  DecisionPM,
  GarantiaAnalisis,
  GarantiaInput,
  IndustriaEstimada,
  InputCotizacion,
  MavConsulta,
  PoliticaFondo,
  ResultadoScoring,
} from "@/shared/types";
import type { ExtrasCotizacion } from "@/lib/scoring/cotizar";

export type NombreHerramienta =
  | "ver_politica_del_fondo"
  | "consultar_bcra"
  | "ver_cartera_actual"
  | "consultar_mav"
  | "analizar_balance"
  | "clasificar_industria"
  | "analizar_garantia"
  | "emitir_cotizacion";

export const NOMBRES_HERRAMIENTAS: readonly NombreHerramienta[] = [
  "ver_politica_del_fondo",
  "consultar_bcra",
  "ver_cartera_actual",
  "consultar_mav",
  "analizar_balance",
  "clasificar_industria",
  "analizar_garantia",
  "emitir_cotizacion",
];

export interface CarteraActual {
  totalAssets: string; // pesos, string decimal
  exposicionPorLibrador: Record<string, string>; // libradorHash → pesos comprados (Funded)
  /** id de industria (como string) → pesos comprados. Lo llena la capa chain; puede faltar. */
  exposicionPorIndustria?: Record<string, string>;
  /** Pesos en ARGt líquidos. Lo llena la capa chain; puede faltar. */
  liquidez?: string;
}

/** Lo que el gestor pudo leer del balance que pegó el usuario. Nunca inventa cifras: lo que no encontró queda en null. */
export interface AnalisisBalance {
  disponible: boolean; // false = no se cargó balance (se usa solo el BCRA)
  ventas: string | null; // tal cual figuran en el texto, string decimal
  deuda: string | null;
  liquidez: string | null;
  patrimonio: string | null;
  resumen: string; // castellano, para mostrar y para fundamentar
}

export interface ContextoIndustria {
  cuit: string;
  denominacion: string | null; // la que devuelve el BCRA
  balance: AnalisisBalance;
}

/** Lo único que el gestor puede hacer en el mundo. Cada una devuelve datos; ninguna mueve fondos. */
export interface Herramientas {
  ver_politica_del_fondo(): Promise<PoliticaFondo>;
  consultar_bcra(cuit: string): Promise<ResultadoScoring>;
  ver_cartera_actual(): Promise<CarteraActual>;
  consultar_mav(cuit: string): Promise<MavConsulta>;
  analizar_balance(balance: string | undefined): Promise<AnalisisBalance>;
  clasificar_industria(ctx: ContextoIndustria): Promise<IndustriaEstimada>;
  analizar_garantia(garantia: GarantiaInput, nominal: string): Promise<GarantiaAnalisis>;
  emitir_cotizacion(input: InputCotizacion, scoring: ResultadoScoring, extras?: ExtrasCotizacion): Promise<Cotizacion>;
}

export interface PasoAgente {
  n: number;
  tipo: "pensamiento" | "herramienta" | "conclusion";
  titulo: string;
  detalle: string;
  herramienta?: NombreHerramienta;
}

export type Accion =
  | { tipo: "pensar"; titulo: string; detalle: string }
  | { tipo: "usar"; herramienta: NombreHerramienta }
  | { tipo: "concluir"; decision: DecisionPM["decision"]; condiciones: string[]; resumen: string; motivo: string | null };

/** Lo que el analista ve para decidir el próximo paso. */
export interface EstadoAgente {
  input: InputCotizacion;
  politica?: PoliticaFondo;
  scoring?: ResultadoScoring;
  cartera?: CarteraActual;
  mav?: MavConsulta;
  balance?: AnalisisBalance;
  industria?: IndustriaEstimada;
  /** undefined = todavía no se revisó; null = revisada y no hay garantía cargada. */
  garantia?: GarantiaAnalisis | null;
  cotizacion?: Cotizacion;
  pasos: PasoAgente[];
}

/** Decide el próximo paso: un modelo con tool-use o, si falla, el determinístico (misma interfaz). */
export interface Analista {
  modo: "agente" | "determinista";
  siguiente(estado: EstadoAgente): Promise<Accion>;
}

export interface ResultadoAgente {
  cotizacion: Cotizacion;
  pasos: PasoAgente[];
  alertas: string[]; // concentración, industria, liquidez: el contrato es quien las hace cumplir
  modo: "agente" | "determinista";
  /** Lo que el gestor proyectó con la cartera (bps del patrimonio); null = no se pudo calcular. Lo usa el informe. Opcional: los clientes viejos no lo conocen. */
  proyecciones?: { emisorBps: number | null; industriaBps: number | null; liquidezPosteriorBps: number | null; politica: PoliticaFondo };
}
