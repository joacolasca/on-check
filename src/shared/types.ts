// Tipos compartidos. Tienen que coincidir EXACTAMENTE con docs/INTERFACES.md (enchufes 2 y 3).
// No cambiar sin avisar y actualizar INTERFACES.md en el mismo PR.

export type Banda = 'A' | 'B' | 'C' | 'D';

// ---------- Enchufe 2 — Scoring ----------

export interface ResultadoScoring {
  cuit: string;
  denominacion: string | null; // nombre que devuelve el BCRA, si lo hay
  puntaje: number; // 0–100, arranca en 100
  banda: Banda;
  situacionPeor: number; // 1 = normal … 5/6 = irrecuperable
  chequesRechazadosImpagos: number; // últimos 12 meses
  refinanciaciones: boolean;
  deudaCreciente: boolean;
  ajustes: { motivo: string; puntos: number }[]; // ej. { motivo: 'Situación 2 en una entidad', puntos: -15 }
  fuente: 'bcra-live' | 'bcra-cache';
  consultadoEn: string; // ISO
}

export interface InputCotizacion {
  cuit: string; // del librador (cheque) o suscriptor (pagaré)
  nominal: string; // en pesos, string decimal ("10000000")
  vencimiento: string; // ISO date
  pyme: string; // address de la pyme (wallet de demo)
  tipo?: TipoActivo; // v2: por defecto 'cheque'
  garantia?: GarantiaInput; // v2: prenda que ofrece el vendedor
  balance?: string; // v2: balance del emisor pegado como texto (si no es público)
}

export interface ConfigFondo {
  tamarTnaBps: number; // ⚠️ valor con fecha y fuente, en config
  spreadPorBandaBps: Record<Banda, number | null>; // null = no se compra
  plazoMaxDias: number;
  nominalMin: string;
  nominalMax: string;
}

export interface Cotizacion {
  tipo: TipoActivo; // v2
  industria: IndustriaEstimada; // v2: estimada por el agente
  garantia?: GarantiaAnalisis; // v2
  mav?: MavConsulta; // v2 (simulado en la demo)
  decisionPM?: DecisionPM; // v2
  id: string; // bytes32 hex, determinístico
  libradorHash: string; // bytes32 hex
  input: InputCotizacion;
  scoring: ResultadoScoring;
  dias: number;
  tasaTnaBps: number;
  descuento: string; // pesos
  precioCompra: string; // pesos
  aprobada: boolean;
  motivoRechazo: string | null;
  explicacion: string; // castellano, 2–3 oraciones, sin la palabra "rinde"
  cotizacionHash: string; // keccak256 del JSON canónico de la cotización (sin este campo)
  firma?: string; // `${exp}.${hmacHex}` puesta por el servidor; fuera de cotizacionHash
}

export interface ScoreOpts {
  modo?: 'live' | 'cache' | 'auto';
}

// ---------- Enchufe 3 — API HTTP ----------

export type EstadoCheque = 'Pending' | 'Funded' | 'Paid' | 'Rejected';

export interface ResumenFondo {
  totalAssets: string;
  liquidez: string;
  enCheques: string;
  valorCuotaparte: string; // assets por share
  cantidadCheques: Record<EstadoCheque, number>;
  concentracionMaxBps: number; // la del librador con más exposición
  rechazos: { cantidad: number; perdida: string };
  tirAnualizadaBps: number | null; // sobre cheques cerrados; null si no hay
  direccionContrato: string;
  red: 'base-sepolia';
  // v2
  politica: PoliticaFondo;
  composicion: Composicion;
  liquidezBps: number; // liquidez / patrimonio
  cuotapartesEmitidas: string;
  comision: { devengadaCuotapartes: string; devengadaPesos: string };
  rescatesPendientes: number;
  modoDemo: boolean; // el gestor puede liquidar rescates antes del plazo (solo demo)
}

export interface ChequeVista {
  id: string;
  libradorHashCorto: string; // 0x9f3a…c41e
  nominal: string;
  precioCompra: string;
  vencimiento: string;
  puntaje: number;
  banda: Banda;
  tasaTnaBps: number;
  estado: EstadoCheque;
  explicacion: string;
  txs: { tipo: string; hash: string; url: string }[]; // links a BaseScan
  // v2
  tipo: TipoActivo;
  industria: string;
  emisorNombre: string | null;
  garantia: { tipo: TipoGarantia; coberturaBps: number } | null;
}

export type CuentaDemo = 'inversor1' | 'inversor2';

export interface ApiError {
  error: { codigo: string; mensaje: string };
}

export interface ArgtReal {
  totalSupply: string;
  fuente: 'base-mainnet';
  direccion: string;
}

// ---------- Estado de las wallets de demo (GET /api/demo/cuentas) ----------

export type RolCuentaDemo = 'admin' | 'originador' | 'oraculo' | 'inversor1' | 'inversor2' | 'pyme';

export interface CuentaDemoEstado {
  id: RolCuentaDemo;
  direccion: string;
  eth: string; // saldo para gas, string decimal
  argt: string; // saldo de mARGt, string decimal
  kyc: boolean;
}


// ================================================================ v2 — Fondo de cheques y pagarés con gestor (PM)
// Fuente de verdad: docs/V2-SPEC.md. Las industrias salen de shared/industrias.json.

export type TipoActivo = 'cheque' | 'pagare';

// El orden es el del uint8 del contrato (tipoGarantia).
export const TIPOS_GARANTIA = ['ninguna', 'vehiculo', 'inmueble', 'terreno', 'embarcacion', 'energia', 'petroleo', 'fabrica', 'comercio', 'otra'] as const;
export type TipoGarantia = (typeof TIPOS_GARANTIA)[number];

export interface GarantiaInput {
  tipo: TipoGarantia;
  descripcion: string; // "Camioneta Toyota Hilux 2022, dominio AB123CD"
  valorDeclarado: string; // pesos, string decimal
  documentos?: string[]; // nombres/descripciones de lo que adjunta el vendedor
}

export interface GarantiaAnalisis {
  tipo: TipoGarantia;
  descripcion: string;
  valorDeclarado: string;
  haircutBps: number; // descuento por liquidez/depreciación (supuesto del fondo, a validar)
  valorAjustado: string; // valorDeclarado × (1 − haircut)
  coberturaBps: number; // valorAjustado / nominal, en bps (10000 = 100 %)
  liquidez: 'alta' | 'media' | 'baja'; // qué tan fácil es venderla si hay que ejecutar la prenda
  riesgos: string[];
  documentosPendientes: string[]; // lo que falta para instrumentar la prenda
  observaciones: string; // castellano, sin inventar datos que no están en la entrada
  analizadoPor: 'agente' | 'determinista';
  garantiaHash: string; // bytes32: keccak256 del JSON canónico del análisis
}

export interface IndustriaEstimada {
  id: number; // índice en shared/industrias.json (0 = sin clasificar)
  nombre: string;
  fundamento: string; // por qué: balance, registros públicos del BCRA, conocimiento general
  fuentes: string[]; // de dónde sale (p. ej. "BCRA", "balance cargado", "criterio del agente")
  confianza: 'alta' | 'media' | 'baja';
}

export interface MavConsulta {
  fuente: 'MAV (simulado)'; // en la demo el MAV está simulado y se dice así en pantalla
  operaciones: number; // cheques/pagarés del emisor negociados en el último período
  tasaPromedioTnaBps: number | null;
  plazoPromedioDias: number | null;
  ultimaOperacion: string | null; // ISO date
  nota: string;
}

export interface DecisionPM {
  decision: 'aprobar' | 'aprobar_con_condiciones' | 'rechazar';
  condiciones: string[];
  resumen: string;
}

export interface PoliticaFondo {
  maxEmisorBps: number; // 1000 = 10 %
  maxIndustriaBps: number; // 2500 = 25 %
  liquidezMinBps: number; // 1500 = 15 %
  objetivoTnaBps: number; // 4000 = 40 % (objetivo, nunca una promesa)
  comisionAnualBps: number; // 300 = 3 % anual sobre el patrimonio, devengada día a día
  precioInicialCuotaparte: string; // "1000"
  minCuotapartes: string; // "1000": toda suscripción es de al menos 1.000 cuotapartes enteras, de a 1
  rescateHorasHabiles: number; // 24
  rescateCorteHora: number; // 15 (hora de Buenos Aires)
}

export interface PorcionComposicion {
  clave: string; // libradorHash, id de industria, 'cheque' | 'pagare'
  etiqueta: string; // nombre legible (emisor conocido, industria, tipo)
  monto: string; // pesos comprados (Funded) a su costo
  bps: number; // sobre lo invertido en cheques/pagarés
}

export interface Composicion {
  porEmisor: PorcionComposicion[];
  porIndustria: PorcionComposicion[];
  porTipo: PorcionComposicion[];
}

export type EstadoRescate = 'Pendiente' | 'Liquidado' | 'Cancelado';

export interface RescateVista {
  id: string;
  duenio: string; // address
  cuotapartes: string; // decimal
  solicitadoEn: string; // ISO
  liquidableDesde: string; // ISO (24 h hábiles, corte 15 hs Buenos Aires)
  estado: EstadoRescate;
  monto: string | null; // pesos pagados si ya se liquidó
}

export interface PosicionInversor {
  cuenta: CuentaDemo;
  cuotapartes: string;
  valor: string; // pesos al valor de cuotaparte actual
  rescates: RescateVista[];
}


// ================================================================ Mandato (agente que invierte con las reglas del inversor)
// Fuente de verdad: docs/MANDATO-SPEC.md. El mandato lo fija el inversor una vez; el servidor hace cumplir las reglas
// (fijas, sin modelo) y el contrato hace cumplir las del fondo. El estado viaja firmado entre llamadas (sin base de datos).

export interface Mandato {
  presupuesto: string; // pesos, string decimal: máximo a invertir en esta corrida
  bandaMinima: Banda; // 'A' | 'B' | 'C': compra solo esa banda o mejor
  topeEmisorBps: number; // % del presupuesto en un mismo emisor (el fondo tiene su propio tope, más estricto)
  plazoMaxDias: number; // hasta 90
  tipos: TipoActivo[]; // qué instrumentos acepta
  coberturaMinBps: number | null; // garantía: cobertura mínima (11000 = 110 %); null = no exige
  aprobacionSobre: string | null; // pesos: por encima de este nominal pide aprobación humana; null = nunca (autónomo)
}

export interface ActivoBandeja {
  id: string;
  cuit: string;
  nombre: string;
  tipo: TipoActivo;
  nominal: string; // pesos
  dias: number;
  garantia?: GarantiaInput;
  balance?: string;
  nota?: string; // por qué está en la demo (solo para el equipo)
  reboteSimulado?: boolean; // el oráculo de la demo lo hace rebotar después de comprarlo
}

export type ReglaMandato = 'revocado' | 'tipo' | 'plazo' | 'cotizacion' | 'banda' | 'gestor' | 'cobertura' | 'emisor_bloqueado' | 'tope_emisor' | 'presupuesto' | 'aprobacion';
export interface RazonMandato {
  regla: ReglaMandato;
  cumple: boolean;
  mensaje: string; // castellano
}
export type ResultadoMandato = 'comprar' | 'omitir' | 'pendiente_aprobacion';

export interface CompraMandato {
  activoId: string;
  nombre: string;
  libradorHash: string;
  chequeId: string;
  nominal: string;
  precioCompra: string;
  tx: string;
  estado: 'Funded' | 'Paid' | 'Rejected';
}

export interface EstadoMandato {
  mandato: Mandato;
  invertido: string; // pesos comprados (Funded) a su costo; baja con un rebote o un pago
  disponible: string; // presupuesto − invertido
  exposicionPorEmisor: Record<string, string>; // libradorHash → pesos
  emisoresBloqueados: string[]; // libradorHash que el agente dejó de comprar tras un rebote
  compras: CompraMandato[];
  revocado: boolean;
  creadoEn: string; // ISO
  firma?: string; // HMAC del servidor; las rutas rechazan un estado sin firma válida
}

export interface EvaluacionMandato {
  activoId: string;
  resultado: ResultadoMandato;
  razones: RazonMandato[]; // todas las reglas, cumplan o no, en el orden de evaluación
  cotizacion: Cotizacion;
  resumen: string; // castellano, para el log y el informe
}

export interface EjecucionMandato {
  activoId: string;
  estado: EstadoMandato; // ya actualizado y firmado
  compra: CompraMandato | null;
  rechazoContrato: { codigo: string; mensaje: string } | null; // el contrato dijo que no (10 %, 25 %, liquidez…): se registra y se sigue
}

export interface ReboteMandato {
  estado: EstadoMandato;
  chequeId: string;
  perdida: string; // pesos
  emisorBloqueado: string; // nombre
  replanificar: string[]; // ids de la bandeja que vale la pena volver a evaluar
  explicacion: string; // castellano
  tx: string;
}

export interface InformeMandato {
  generadoEn: string;
  mandato: Mandato;
  antes: { patrimonio: string; liquidezBps: number; valorCuotaparte: string };
  despues: { patrimonio: string; liquidezBps: number; valorCuotaparte: string };
  comprados: CompraMandato[];
  omitidos: { activoId: string; nombre: string; razones: RazonMandato[] }[];
  rechazadosPorContrato: { activoId: string; nombre: string; codigo: string; mensaje: string }[];
  rebotes: { chequeId: string; nombre: string; perdida: string }[];
  emisoresBloqueados: string[];
  invertido: string;
  disponible: string;
}
