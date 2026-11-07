// Antecedentes de cheques rechazados del librador (BCRA, /Deudas/ChequesRechazados). Función pura: no toca la red.
// Regla de exclusión (7-11-2026): nunca se compra a un librador con un cheque rechazado impago CONFIRMADO, de cualquier antigüedad.
// TODO(confirmar quién lo decidió): ver docs/DECISIONS.md.
import type { ChequeRechazadoBcra, DatosBcra } from "./bcra-tipos";

/** Causales de rechazo que no reflejan capacidad de pago: no cuentan como impago. Decisión del 3-11-2026 (TODO: que Facu la revise). */
export const CAUSALES_QUE_NO_CUENTAN = ["DEFECTOS FORMALES"];

export type EstadoAntecedentes = "limpio" | "impago" | "en_revision" | "no_verificado";

export interface AntecedentesCheques {
  estado: EstadoAntecedentes;
  impagosConfirmados: number;
  enRevision: number;
  regularizados: number;
  administrativos: number;
  /** El impago confirmado más reciente (por fecha de rechazo). */
  ultimoImpago: ChequeRechazadoBcra | null;
}

/** Causal administrativa (p. ej. DEFECTOS FORMALES): no refleja capacidad de pago. */
export const esAdministrativo = (c: ChequeRechazadoBcra): boolean => CAUSALES_QUE_NO_CUENTAN.includes(c.causal.toUpperCase());

/** Clasifica cada cheque: regularizado (con fecha de pago) > administrativo > en revisión > impago confirmado. */
export function antecedentesCheques(datos: Pick<DatosBcra, "rechazados" | "rechazadosVerificados">): AntecedentesCheques {
  let regularizados = 0;
  let administrativos = 0;
  let enRevision = 0;
  const impagos: ChequeRechazadoBcra[] = [];
  for (const c of datos.rechazados) {
    if (!c.impago) regularizados++;
    else if (esAdministrativo(c)) administrativos++;
    else if (c.enRevision === true) enRevision++;
    else impagos.push(c);
  }
  const ultimoImpago = impagos.reduce<ChequeRechazadoBcra | null>((u, c) => (u === null || c.fechaRechazo > u.fechaRechazo ? c : u), null);
  const estado: EstadoAntecedentes =
    impagos.length > 0 ? "impago" : datos.rechazadosVerificados === false ? "no_verificado" : enRevision > 0 ? "en_revision" : "limpio";
  return { estado, impagosConfirmados: impagos.length, enRevision, regularizados, administrativos, ultimoImpago };
}

// Marcas de los ajustes de 0 puntos que llevan la exclusión de scoring a cotizar() (ResultadoScoring no tiene campo para esto).
export const MARCA_IMPAGO = "Exclusión por cheques rechazados impagos: ";
export const MARCA_SIN_VERIFICAR = "Exclusión por datos insuficientes: ";

const fechaCorta = (iso: string): string => {
  const [a, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${a}`;
};

/** Ajustes de 0 puntos con el motivo de rechazo, o [] si no hay nada que excluya. */
export function ajustesAntecedentes(a: AntecedentesCheques): { motivo: string; puntos: number }[] {
  if (a.estado === "impago" && a.ultimoImpago) {
    const n = a.impagosConfirmados;
    const u = a.ultimoImpago;
    const motivo = `El librador tiene ${n} cheque${n > 1 ? "s" : ""} rechazado${n > 1 ? "s" : ""} sin pagar informado${n > 1 ? "s" : ""} por el BCRA (el último el ${fechaCorta(u.fechaRechazo)}, causal ${u.causal.toLowerCase()}): el fondo no compra cheques de libradores con impagos.`;
    return [{ motivo: `${MARCA_IMPAGO}${motivo}`, puntos: 0 }];
  }
  if (a.estado === "no_verificado") {
    return [{ motivo: `${MARCA_SIN_VERIFICAR}No pudimos verificar en el BCRA los antecedentes de cheques rechazados del librador: no se aprueba sin esa verificación.`, puntos: 0 }];
  }
  if (a.estado === "en_revision") {
    const n = a.enRevision;
    return [{ motivo: `${MARCA_SIN_VERIFICAR}El BCRA informa ${n} cheque${n > 1 ? "s" : ""} rechazado${n > 1 ? "s" : ""} del librador en revisión: no podemos confirmar si ${n > 1 ? "están pagos" : "está pago"}, y sin esa verificación no se aprueba.`, puntos: 0 }];
  }
  return [];
}

/** Motivo de rechazo que dejó scoring en los ajustes (impago primero), o null. */
export function motivoExclusionDe(ajustes: { motivo: string }[]): string | null {
  for (const marca of [MARCA_IMPAGO, MARCA_SIN_VERIFICAR]) {
    const a = ajustes.find((x) => x.motivo.startsWith(marca));
    if (a) return a.motivo.slice(marca.length);
  }
  return null;
}
