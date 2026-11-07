// Filtro de lo que el gestor le puede decir al cliente: nunca "rinde" ni "rendimiento garantizado",
// nunca la sigla de la tecnología ("IA"/"AI" como palabra suelta: en palabras comunes como "garantía" no cuenta).
const FRASES = /rinde|rendimiento garantizado/i;
const SIGLA = /\b(?:IA|AI)\b/;

export const esTextoSeguro = (t: string): boolean => !FRASES.test(t) && !SIGLA.test(t);
/** Devuelve `t` si es seguro y, si no, la alternativa. */
export const limpiarTexto = (t: string, alternativa: string): string => (esTextoSeguro(t) ? t : alternativa);
