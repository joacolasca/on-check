// Capa chain (Rama / Joaquín): lectura y escritura del fondo en Base Sepolia, y lectura del ARGt real en Base mainnet.
export { leerArgtReal } from "./argt";
export { ConfigChainError, hayChain, leerConfig, type ConfigChain } from "./config";
export { direccionDe } from "./clientes";
export { guardarCotizacion, guardarInforme, obtenerInforme } from "./cotizaciones";
export { ErrorApi, errorCuotapartesEnteras, errorMinimoCuotapartes, MIN_CUOTAPARTES, traducirError } from "./errores";
export { aChequeVista, invalidarEstado, leerCartera, leerCuentas, leerEstado, leerPosicion, leerRescates } from "./estado";
export { aprobarKyc, fondearCheque, invertir, liquidarCheque, liquidarRescates, registrarCheque, setModoDemo, solicitarRescate, type AlBloque } from "./operaciones";
export { componer, emisoresConocidos, etiquetaEmisor, nombreEmisor, type ItemComposicion } from "./composicion";
export { resolverSuscripcion, type PedidoSuscripcion } from "./suscripcion";
export { INDUSTRIAS, nombreIndustria } from "./industrias";
export { POLITICA_POR_DEFECTO } from "./politica";
export { explicarLiquidacion, liquidableDesde, type ResultadoLiquidacion, type RescateLiquidado, type RescateOmitido } from "./rescates";
