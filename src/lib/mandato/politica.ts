// Reglas del mandato (docs/MANDATO-SPEC.md). Puras, sin modelo y sin red: las hace cumplir el servidor.
// Toda la plata va en centavos (bigint); nunca `number`. El contrato del fondo tiene sus propias reglas, aparte de estas.
import { formatBps, formatPesos } from "@/lib/format";
import { aCentavos, deCentavos } from "@/lib/scoring/dinero";
import type { ActivoBandeja, Banda, Cotizacion, EstadoMandato, EvaluacionMandato, Mandato, RazonMandato, ReglaMandato, ResultadoMandato, TipoActivo } from "@/shared/types";

export const PRESUPUESTO_MAX = "100000000";
const ORDEN_BANDA: Record<Banda, number> = { A: 3, B: 2, C: 1, D: 0 };

/** Pesos con hasta 2 decimales y hasta 12 enteros (así ni el redondeo ni el largo dan sorpresas). */
export const esMontoMandato = (v: unknown): v is string => typeof v === "string" && /^\d{1,12}(\.\d{1,2})?$/.test(v);
const esPositivo = (v: string): boolean => aCentavos(v) > 0n;
const esEntero = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export type ResultadoValidacion = { ok: true; mandato: Mandato } | { ok: false; mensaje: string };

/** Valida un mandato que llega de afuera y devuelve uno normalizado (sin campos de más). */
export function validarMandato(x: unknown): ResultadoValidacion {
  const no = (mensaje: string): ResultadoValidacion => ({ ok: false, mensaje });
  if (x === null || typeof x !== "object" || Array.isArray(x)) return no("El mandato tiene que ser un objeto.");
  const m = x as Record<string, unknown>;

  if (!esMontoMandato(m.presupuesto) || !esPositivo(m.presupuesto)) return no("El presupuesto tiene que ser un monto en pesos mayor a cero, como texto decimal (por ejemplo \"40000000\").");
  if (aCentavos(m.presupuesto) > aCentavos(PRESUPUESTO_MAX)) return no(`El presupuesto no puede pasar de ${formatPesos(PRESUPUESTO_MAX)}.`);
  if (!esEntero(m.topeEmisorBps, 100, 10_000)) return no("El tope por emisor tiene que ser un entero de 100 a 10000 puntos básicos (1 % a 100 % del presupuesto).");
  if (!esEntero(m.plazoMaxDias, 1, 90)) return no("El plazo máximo tiene que ser un entero de 1 a 90 días.");
  if (!Array.isArray(m.tipos) || m.tipos.length === 0 || m.tipos.some((t) => t !== "cheque" && t !== "pagare")) return no('Los instrumentos tienen que ser una lista no vacía con "cheque" y/o "pagare".');
  const tipos = [...new Set(m.tipos as TipoActivo[])];
  if (m.coberturaMinBps !== null && !esEntero(m.coberturaMinBps, 0, 30_000)) return no("La cobertura mínima de la garantía tiene que ser null o un entero de 0 a 30000 puntos básicos.");
  if (m.bandaMinima !== "A" && m.bandaMinima !== "B" && m.bandaMinima !== "C") return no("La banda mínima tiene que ser A, B o C.");
  if (m.aprobacionSobre !== null && (!esMontoMandato(m.aprobacionSobre) || !esPositivo(m.aprobacionSobre))) return no("El monto de aprobación tiene que ser null o un monto en pesos mayor a cero.");

  return {
    ok: true,
    mandato: {
      presupuesto: m.presupuesto,
      bandaMinima: m.bandaMinima,
      topeEmisorBps: m.topeEmisorBps,
      plazoMaxDias: m.plazoMaxDias,
      tipos,
      coberturaMinBps: m.coberturaMinBps,
      aprobacionSobre: m.aprobacionSobre,
    },
  };
}

const pesos = (c: bigint): string => formatPesos(deCentavos(c));
const nombreTipo = (t: TipoActivo): string => (t === "pagare" ? "pagaré" : "cheque");
const nombreTipos = (ts: TipoActivo[]): string => ts.map((t) => `${nombreTipo(t)}s`).join(" y ");
const pct = (bps: number): string => formatBps(bps);

/**
 * Las 11 reglas, en el orden de la spec. Devuelve TODAS las razones y decide:
 *  - `comprar` si cumplen todas;
 *  - `pendiente_aprobacion` si solo falla la 11 (el nominal pasa el umbral que pidió el inversor);
 *  - `omitir` en cualquier otro caso.
 * Tipo, plazo y nominal salen de la cotización (que viaja firmada), no del activo que mandó el navegador: el activo solo aporta id y nombre.
 */
export function evaluarMandato(activo: ActivoBandeja, cotizacion: Cotizacion, estado: EstadoMandato): EvaluacionMandato {
  const { mandato } = estado;
  const tipo: TipoActivo = cotizacion.tipo ?? activo.tipo;
  const dias = cotizacion.dias;
  const nominal = cotizacion.input?.nominal ?? activo.nominal;
  const hayPrecio = cotizacion.aprobada === true;
  const precio = hayPrecio ? aCentavos(cotizacion.precioCompra) : 0n;
  const emisor = String(cotizacion.libradorHash ?? "").toLowerCase();
  const razones: RazonMandato[] = [];
  const agregar = (regla: ReglaMandato, cumple: boolean, mensaje: string) => razones.push({ regla, cumple, mensaje });
  const sinPrecio = "No se pudo evaluar: sin una cotización aprobada no hay precio de compra.";

  // 1. revocado
  agregar("revocado", !estado.revocado, estado.revocado ? "El mandato está revocado: no se compra nada." : "El mandato está vigente.");

  // 2. tipo
  const tipoOk = mandato.tipos.includes(tipo);
  agregar("tipo", tipoOk, tipoOk ? `Es un ${nombreTipo(tipo)}, y tu mandato acepta ${nombreTipos(mandato.tipos)}.` : `Es un ${nombreTipo(tipo)} y tu mandato solo acepta ${nombreTipos(mandato.tipos)}.`);

  // 3. plazo
  const plazoOk = dias <= mandato.plazoMaxDias;
  agregar("plazo", plazoOk, plazoOk ? `Vence en ${dias} días, dentro de tu máximo de ${mandato.plazoMaxDias}.` : `Vence en ${dias} días y tu máximo es de ${mandato.plazoMaxDias}.`);

  // 4. cotización aprobada
  agregar(
    "cotizacion",
    hayPrecio,
    hayPrecio ? `El scoring aprobó la cotización: precio de compra ${pesos(precio)}.` : `El scoring no aprobó la cotización${cotizacion.motivoRechazo ? `: ${cotizacion.motivoRechazo}` : "."}`,
  );

  // 5. banda
  const banda = cotizacion.scoring?.banda ?? "D";
  const bandaOk = ORDEN_BANDA[banda] >= ORDEN_BANDA[mandato.bandaMinima];
  agregar("banda", bandaOk, bandaOk ? `Banda ${banda}, igual o mejor que tu mínimo (${mandato.bandaMinima}).` : `Banda ${banda}, peor que tu mínimo (${mandato.bandaMinima}).`);

  // 6. gestor
  const decision = cotizacion.decisionPM?.decision;
  const gestorOk = decision !== "rechazar";
  agregar("gestor", gestorOk, gestorOk ? (decision ? `El gestor ${decision === "aprobar" ? "aprobó" : "aprobó con condiciones"} el activo.` : "El gestor no objetó el activo.") : "El gestor rechazó el activo.");

  // 7. cobertura de la garantía
  const minCob = mandato.coberturaMinBps;
  const garantia = cotizacion.garantia;
  if (minCob === null) agregar("cobertura", true, "Tu mandato no exige cobertura de garantía.");
  else if (garantia) {
    const ok = garantia.coberturaBps >= minCob;
    agregar("cobertura", ok, ok ? `La garantía cubre el ${pct(garantia.coberturaBps)} del nominal (pedís al menos ${pct(minCob)}).` : `La garantía cubre el ${pct(garantia.coberturaBps)} del nominal y pedís al menos ${pct(minCob)}.`);
  } else if (tipo === "pagare") agregar("cobertura", false, `Es un pagaré sin garantía y pedís una cobertura de al menos ${pct(minCob)}.`);
  else agregar("cobertura", true, "Es un cheque: la cobertura de garantía no aplica.");

  // 8. emisor bloqueado
  const bloqueado = estado.emisoresBloqueados.map((h) => h.toLowerCase()).includes(emisor);
  agregar("emisor_bloqueado", !bloqueado, bloqueado ? "El agente dejó de comprarle a este emisor después de un rebote." : "El emisor no está bloqueado.");

  // 9. tope por emisor (sobre el presupuesto)
  const tope = (aCentavos(mandato.presupuesto) * BigInt(mandato.topeEmisorBps)) / 10_000n;
  const expuesto = aCentavos(estado.exposicionPorEmisor[emisor] ?? "0");
  if (!hayPrecio) agregar("tope_emisor", false, sinPrecio);
  else {
    const ok = expuesto + precio <= tope;
    agregar(
      "tope_emisor",
      ok,
      ok
        ? `Con esta compra el emisor suma ${pesos(expuesto + precio)}, dentro de tu tope de ${pesos(tope)} (${pct(mandato.topeEmisorBps)} del presupuesto).`
        : `Con esta compra el emisor sumaría ${pesos(expuesto + precio)} y tu tope es de ${pesos(tope)} (${pct(mandato.topeEmisorBps)} del presupuesto).`,
    );
  }

  // 10. presupuesto disponible
  const disponible = aCentavos(estado.disponible);
  if (!hayPrecio) agregar("presupuesto", false, sinPrecio);
  else {
    const ok = precio <= disponible;
    agregar("presupuesto", ok, ok ? `Cuesta ${pesos(precio)} y te quedan ${pesos(disponible)} del presupuesto.` : `Cuesta ${pesos(precio)} y solo te quedan ${pesos(disponible)} del presupuesto.`);
  }

  // 11. aprobación humana
  const umbral = mandato.aprobacionSobre;
  const pide = umbral !== null && aCentavos(nominal) > aCentavos(umbral);
  agregar(
    "aprobacion",
    !pide,
    umbral === null ? "Tu mandato es autónomo: no pide aprobación." : pide ? `El nominal (${formatPesos(nominal)}) supera los ${formatPesos(umbral)}: queda esperando tu aprobación.` : `El nominal (${formatPesos(nominal)}) no supera los ${formatPesos(umbral)}: no necesita tu aprobación.`,
  );

  const fallan = razones.filter((r) => !r.cumple);
  const resultado: ResultadoMandato = fallan.length === 0 ? "comprar" : fallan.every((r) => r.regla === "aprobacion") ? "pendiente_aprobacion" : "omitir";
  const nombre = activo.nombre;
  const descripcion = `${nombre}, ${nombreTipo(tipo)} de ${formatPesos(nominal)} a ${dias} días`;
  let resumen: string;
  if (resultado === "comprar") {
    resumen = `Compro: ${descripcion}. Cumple las 11 reglas del mandato; el precio es ${pesos(precio)} y después de comprarlo te quedan ${pesos(disponible - precio)} del presupuesto.`;
  } else if (resultado === "pendiente_aprobacion") {
    resumen = `Espero tu aprobación: ${descripcion}. Cumple las demás reglas, pero el nominal supera los ${formatPesos(umbral ?? "0")} que fijaste. Precio de compra: ${pesos(precio)}.`;
  } else {
    resumen = `Omito: ${descripcion}. No cumple ${fallan.length === 1 ? "una regla" : `${fallan.length} reglas`} del mandato: ${fallan.map((r) => r.mensaje).join(" ")}`;
  }

  return { activoId: activo.id, resultado, razones, cotizacion, resumen };
}
