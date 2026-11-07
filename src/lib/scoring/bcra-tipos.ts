// Forma normalizada de lo que devuelve la Central de Deudores del BCRA (ver docs/handoff/scoring.md).

export interface EntidadDeuda {
  entidad: string;
  situacion: number; // 0 = sin deuda en el período; 1 = normal … 5/6 = irrecuperable
  monto: number; // miles de pesos
  refinanciaciones: boolean;
  juridico?: boolean; // situacionJuridica o procesoJud del BCRA (concurso, quiebra, juicio)
}

export interface ChequeRechazadoBcra {
  fechaRechazo: string; // AAAA-MM-DD
  causal: string;
  impago: boolean; // sin fecha de pago
  enRevision?: boolean; // el BCRA lo marca "en revisión": no está confirmado
}

export interface DatosBcra {
  cuit: string;
  denominacion: string | null;
  entidadesActuales: EntidadDeuda[]; // período más reciente de /Deudas
  deudaPorPeriodo: { periodo: string; total: number }[]; // de /Deudas/Historicas, el más reciente primero
  rechazados: ChequeRechazadoBcra[];
  /** false = no se pudo obtener /ChequesRechazados (falló en vivo y no hay copia): no se sabe si tiene rechazos. Ausente = verificado (un 404 es "sin rechazos"). */
  rechazadosVerificados?: boolean;
  fuente: "bcra-live" | "bcra-cache";
  consultadoEn: string; // ISO
}

/** El BCRA no tiene datos de ese CUIT (404 en /Deudas). */
export class CuitSinDatosError extends Error {
  constructor(public readonly cuit: string) {
    super(`El BCRA no tiene datos del CUIT ${cuit}.`);
    this.name = "CuitSinDatosError";
  }
}

/** El CUIT no tiene 11 dígitos o su dígito verificador no cierra: se rechaza antes de llamar al BCRA. Hereda de CuitSinDatosError para que la API responda 404 CUIT_SIN_DATOS ("revisalo") y no un 502. */
export class CuitInvalidoError extends CuitSinDatosError {
  constructor(cuit: string) {
    super(cuit);
    this.name = "CuitInvalidoError";
    this.message = `El CUIT ${cuit} no es válido (11 dígitos y dígito verificador).`;
  }
}
