// Traduce los errores de la cadena (reverts del contrato, falta de gas, red caída) a { codigo, mensaje } en castellano.
import { BaseError, ContractFunctionRevertedError, HttpRequestError, InternalRpcError, LimitExceededRpcError, TimeoutError } from "viem";
import { formatPesos, unidadesADecimal } from "@/lib/format";
import { nombreIndustria } from "./industrias";

/** Error con la forma de la API: { error: { codigo, mensaje } } y un status HTTP. */
export class ErrorApi extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    public readonly status: number,
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }
}

const pesos = (wei: unknown): string => formatPesos(unidadesADecimal(String(wei)));

/** Suscripción mínima (lote de negociación): 1.000 cuotapartes enteras, de a 1. */
export const MIN_CUOTAPARTES = 1000n;

/** Error de suscripción por debajo del mínimo; con el valor de la cuotaparte de hoy (en wei por cuotaparte) agrega el costo estimado. */
export function errorMinimoCuotapartes(valorCuotapartesWei?: bigint): ErrorApi {
  const costo = valorCuotapartesWei === undefined ? "" : ` (≈ ${pesos(valorCuotapartesWei * MIN_CUOTAPARTES)} al valor de hoy)`;
  return new ErrorApi("MINIMO_CUOTAPARTES", `La suscripción mínima es de 1.000 cuotapartes${costo}.`, 400);
}

export const errorCuotapartesEnteras = (): ErrorApi => new ErrorApi("CUOTAPARTES_ENTERAS", "Las cuotapartes se suscriben enteras, de a 1 (sin fracciones).", 400);

function deRevert(e: ContractFunctionRevertedError): ErrorApi {
  const nombre = e.data?.errorName;
  const args = (e.data?.args ?? []) as unknown[];
  switch (nombre) {
    case "ConcentracionExcedida":
      return new ErrorApi(
        "CONCENTRACION_EXCEDIDA",
        `El contrato no dejó comprar este cheque: con él, el fondo tendría ${pesos(args[1])} comprados a ese librador y el tope permitido es ${pesos(args[2])}. La regla de concentración está dentro del contrato.`,
        409,
      );
    case "IndustriaExcedida":
      return new ErrorApi(
        "INDUSTRIA_EXCEDIDA",
        `El contrato no dejó comprar este activo: con él, el fondo tendría ${pesos(args[1])} en ${nombreIndustria(Number(args[0]))} y el tope por industria es ${pesos(args[2])}. La regla está dentro del contrato.`,
        409,
      );
    case "LiquidezMinimaInsuficiente":
      return new ErrorApi(
        "LIQUIDEZ_MINIMA",
        `El contrato no dejó comprar este activo: el fondo quedaría con ${pesos(args[0])} de liquidez y el mínimo es ${pesos(args[1])}. Esa reserva está para pagar rescates.`,
        409,
      );
    case "MinimoCuotapartes":
      return errorMinimoCuotapartes();
    case "CuotapartesEnteras":
      return errorCuotapartesEnteras();
    case "SinLiquidez":
      return new ErrorApi("SIN_LIQUIDEZ", `El fondo no tiene liquidez suficiente: hay ${pesos(args[0])} disponibles y la operación necesita ${pesos(args[1])}.`, 409);
    case "RescateNoVencido":
      return new ErrorApi(
        "RESCATE_NO_VENCIDO",
        `Ese rescate todavía no se puede liquidar: el plazo de 24 horas hábiles vence el ${new Date(Number(args[1]) * 1000).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} (hora de Buenos Aires).`,
        409,
      );
    case "RescateNoPendiente":
      return new ErrorApi("RESCATE_NO_PENDIENTE", "Ese rescate ya no está pendiente: se liquidó o se canceló.", 409);
    case "RescateInexistente":
      return new ErrorApi("RESCATE_INEXISTENTE", "No existe un rescate con ese número.", 404);
    case "SoloElDuenio":
      return new ErrorApi("SOLO_EL_DUENIO", "Solo quien pidió el rescate puede cancelarlo.", 403);
    case "ERC20InsufficientBalance":
      return new ErrorApi("CUOTAPARTES_INSUFICIENTES", "Esa cuenta no tiene tantas cuotapartes para rescatar.", 409);
    case "SinKyc":
    case "ERC4626ExceededMaxDeposit":
    case "ERC4626ExceededMaxMint":
      return new ErrorApi("SIN_KYC", "Esa cuenta no tiene el KYC aprobado. Aprobalo primero.", 403);
    case "EstadoInvalido":
      return new ErrorApi("ESTADO_INVALIDO", "El cheque no está en el estado correcto para esa operación (por ejemplo, ya fue fondeado o ya se cerró).", 409);
    case "ChequeYaRegistrado":
      return new ErrorApi("CHEQUE_YA_REGISTRADO", "Ese cheque ya está registrado.", 409);
    case "ChequeInexistente":
      return new ErrorApi("CHEQUE_INEXISTENTE", "No existe un cheque con ese id.", 404);
    case "DatosInvalidos":
      return new ErrorApi("DATOS_INVALIDOS", `El contrato rechazó los datos del cheque: ${String(args[0] ?? "datos inválidos")}.`, 400);
    case "AccessControlUnauthorizedAccount":
      return new ErrorApi("CONFIGURACION", "La wallet del servidor no tiene el rol necesario en el contrato. Revisá el deploy.", 500);
    default:
      return new ErrorApi("CONTRATO_REVIRTIO", `El contrato revirtió la operación${nombre ? ` (${nombre})` : ""}.`, 409);
  }
}

/** Un revert "de verdad" trae algo del contrato: error decodificado, motivo, firma o datos crudos. */
function revertConInformacion(e: ContractFunctionRevertedError): boolean {
  return Boolean(e.data?.errorName || e.reason || e.signature || (e.raw && e.raw !== "0x"));
}

/** Textos (en minúscula) de toda la cadena de causas, para detectar fallos de transporte o del proveedor. */
function textosDeLaCadena(e: BaseError): string {
  const partes: string[] = [];
  let actual: unknown = e;
  for (let i = 0; i < 12 && actual instanceof Error; i++) {
    const b = actual as Error & { shortMessage?: string; details?: string; code?: number };
    partes.push(b.shortMessage ?? "", b.message, b.details ?? "", b.code === undefined ? "" : String(b.code));
    actual = b.cause;
  }
  return partes.join(" ").toLowerCase();
}

// "429" solo como número suelto: dentro de una dirección o un hash (hex contiguo) no cuenta.
const SATURACION = /(^|[^0-9a-z])(429|-32005)([^0-9a-z]|$)|too many requests|rate limit/;
const SENIALES_RED = ["max retries", "timed out", "took too long", "fork error", "failed to get account", "fetch failed", "http request failed"];

const redSaturada = () =>
  new ErrorApi("RED_BLOCKCHAIN_SATURADA", "El proveedor de la blockchain está recibiendo demasiados pedidos. Probá de nuevo en unos segundos.", 503);
const redCaida = () => new ErrorApi("RED_BLOCKCHAIN", "No pudimos conectar con la blockchain. Probá de nuevo en un momento.", 502);

/** Clasifica un fallo de transporte/proveedor en la cadena de causas; null si no hay señales. */
function falloDeRed(e: BaseError): ErrorApi | null {
  const texto = textosDeLaCadena(e);
  if (e.walk((x) => x instanceof LimitExceededRpcError) || SATURACION.test(texto)) return redSaturada();
  const transporte = e.walk((x) => x instanceof HttpRequestError || x instanceof TimeoutError || x instanceof InternalRpcError);
  if (transporte || SENIALES_RED.some((t) => texto.includes(t))) return redCaida();
  return null;
}

export function traducirError(e: unknown): ErrorApi {
  if (e instanceof ErrorApi) return e;
  if (e instanceof BaseError) {
    // Para diagnosticar en los logs del servidor; se tapan las URLs porque el RPC lleva la clave en el path.
    console.error(`[chain] ${e.name}: ${e.shortMessage} | ${String(e.cause instanceof Error ? e.cause.message : "").slice(0, 200)}`.replace(/https?:\/\/\S+/g, "<url>"));
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revertConInformacion(revert)) return deRevert(revert);
    const texto = `${e.shortMessage} ${e.message}`.toLowerCase();
    if (texto.includes("insufficient funds") || texto.includes("exceeds the balance")) {
      return new ErrorApi("SIN_GAS", "La wallet del servidor se quedó sin ETH de Base Sepolia para pagar el gas. Cargala desde un faucet.", 503);
    }
    // viem convierte cualquier -32603 de un eth_call en "revert" sin datos: si hay fallo de red en la cadena, es de red.
    const red = falloDeRed(e);
    if (red) return red;
    if (revert instanceof ContractFunctionRevertedError) return deRevert(revert);
    if (texto.includes("network")) return redCaida();
    return new ErrorApi("ERROR_BLOCKCHAIN", "La operación en la blockchain falló. Probá de nuevo.", 502);
  }
  return new ErrorApi("ERROR_INTERNO", "Algo salió mal. Probá de nuevo.", 500);
}
