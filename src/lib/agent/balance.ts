// Lectura del balance que pega el usuario (texto libre). Extrae lo que encuentra (ventas, deuda, liquidez, patrimonio) y NADA más:
// no completa, no estima, no convierte unidades. Lo que no está queda en null y el resumen lo dice.
import { formatPesos } from "@/lib/format";
import type { AnalisisBalance } from "./types";

type Campo = "ventas" | "deuda" | "liquidez" | "patrimonio";

const ETIQUETAS: Record<Campo, RegExp[]> = {
  ventas: [/ventas(?: netas| totales)?/, /ingresos por ventas/, /ingresos operativos/],
  deuda: [/deuda(?: financiera| total| bancaria)?/, /pasivo total/, /endeudamiento financiero/],
  liquidez: [/caja y bancos/, /disponibilidades/, /efectivo y equivalentes/, /activo corriente/, /liquidez/],
  patrimonio: [/patrimonio neto/, /patrimonio/],
};

const sinTildes = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** "$ 12.500.000,50" o "12,500,000.50" → "12500000.5". Devuelve null si no se puede leer sin adivinar. */
export function leerMonto(crudo: string): string | null {
  const t = crudo.replace(/[$\s]/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const ultimoPunto = t.lastIndexOf(".");
  const ultimaComa = t.lastIndexOf(",");
  let enteros: string;
  let decimales = "";
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    const sep = Math.max(ultimoPunto, ultimaComa);
    enteros = t.slice(0, sep).replace(/[.,]/g, "");
    decimales = t.slice(sep + 1);
  } else if (ultimoPunto >= 0 || ultimaComa >= 0) {
    const sep = ultimoPunto >= 0 ? "." : ",";
    const partes = t.split(sep);
    // "1.234.567" o "1,234" (grupos de 3) son miles; "1234,5" o "0.75" son decimales.
    const esMiles = partes.length > 2 || (partes[1].length === 3 && partes[0].length <= 3 && partes[0] !== "0");
    if (esMiles) enteros = partes.join("");
    else {
      enteros = partes[0];
      decimales = partes[1];
    }
  } else {
    enteros = t;
  }
  if (!/^\d+$/.test(enteros) || (decimales && !/^\d+$/.test(decimales))) return null;
  const e = enteros.replace(/^0+(?=\d)/, "");
  const d = decimales.slice(0, 2).replace(/0+$/, "");
  return d ? `${e}.${d}` : e;
}

function buscar(lineas: string[], campo: Campo): string | null {
  for (const etiqueta of ETIQUETAS[campo]) {
    for (const linea of lineas) {
      const m = etiqueta.exec(linea);
      if (!m) continue;
      const resto = linea.slice(m.index + m[0].length);
      // Se salta un año ("Ventas 2025: 12.500.000") y se toma el primer número que sea un monto.
      for (const n of resto.matchAll(/\d[\d.,]*/g)) {
        const crudo = n[0].replace(/[.,]+$/, "");
        if (/^(?:19|20)\d{2}$/.test(crudo)) continue;
        const monto = leerMonto(crudo);
        if (monto === null) continue;
        // Un valor chico con decimales (p. ej. "liquidez corriente: 1,35") es un ratio, no pesos: no se usa como monto.
        if (campo === "liquidez" && /^\d{1,2}\.\d+$/.test(monto)) continue;
        return monto;
      }
    }
  }
  return null;
}

export const SIN_BALANCE =
  "No se cargó balance: el análisis se apoya solo en la Central de Deudores del BCRA.";

export function analizarBalance(texto: string | undefined): AnalisisBalance {
  if (!texto || !texto.trim()) {
    return { disponible: false, ventas: null, deuda: null, liquidez: null, patrimonio: null, resumen: SIN_BALANCE };
  }
  const lineas = texto.split(/\r?\n|;/).map(sinTildes);
  const r = {
    ventas: buscar(lineas, "ventas"),
    deuda: buscar(lineas, "deuda"),
    liquidez: buscar(lineas, "liquidez"),
    patrimonio: buscar(lineas, "patrimonio"),
  };
  const nombres: Record<Campo, string> = { ventas: "ventas", deuda: "deuda", liquidez: "liquidez", patrimonio: "patrimonio" };
  const leidos = (Object.keys(r) as Campo[]).filter((c) => r[c] !== null);
  const faltan = (Object.keys(r) as Campo[]).filter((c) => r[c] === null).map((c) => nombres[c]);
  const enMiles = /en miles|\(miles|miles de pesos|miles de \$/.test(sinTildes(texto));

  let resumen: string;
  if (leidos.length === 0) {
    resumen = "Se cargó un balance, pero no pude leer ventas, deuda, liquidez ni patrimonio: no lo uso. El análisis se apoya en el BCRA.";
  } else {
    resumen =
      `Del balance cargado leí: ${leidos.map((c) => `${nombres[c]} ${formatPesos(r[c] as string)}`).join(", ")}. ` +
      (faltan.length ? `No encontré: ${faltan.join(", ")}. ` : "") +
      "Son las cifras tal cual figuran en el texto pegado, sin auditar." +
      (enMiles ? " El texto parece estar expresado en miles: no convertí las unidades." : "");
  }
  return { disponible: true, ...r, resumen };
}
