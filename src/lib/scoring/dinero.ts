// Montos en pesos como string decimal, sin `number`. Se calcula en centavos con bigint.

export function aCentavos(valor: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(valor)) throw new Error(`Monto inválido: ${valor}`);
  const [e, f = ""] = valor.split(".");
  const fp = f.padEnd(3, "0");
  let c = BigInt(e + fp.slice(0, 2));
  if (fp[2] >= "5") c += 1n; // redondeo half-up
  return c;
}

/** 42838356n → "428383.56"; 100n → "1" (sin ceros de más). */
export function deCentavos(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  const ent = (a / 100n).toString();
  const cen = (a % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${ent}${cen === "00" ? "" : "." + cen.replace(/0$/, "")}`;
}

/** (cantidad × numerador) / denominador, redondeado half-up. */
export function mulDiv(cantidad: bigint, numerador: bigint, denominador: bigint): bigint {
  return (cantidad * numerador * 2n + denominador) / (denominador * 2n);
}
