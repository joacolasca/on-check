// Títulos en castellano de las herramientas del agente (para el chip de cada paso). Sin React.
export const TITULO_HERRAMIENTA: Record<string, string> = {
  ver_reglas_del_fondo: "Reglas del fondo",
  ver_politica_del_fondo: "Política del fondo",
  consultar_bcra: "Consulta al BCRA",
  ver_cartera_actual: "Cartera actual",
  consultar_mav: "MAV (simulado)",
  analizar_balance: "Análisis del balance",
  clasificar_industria: "Clasificación de industria",
  analizar_garantia: "Análisis de la garantía",
  emitir_cotizacion: "Emisión de la cotización",
};

/** Título legible; si la herramienta es nueva y no está en el mapa, devuelve el nombre tal cual. */
export const tituloHerramienta = (nombre: string): string => TITULO_HERRAMIENTA[nombre] ?? nombre;
