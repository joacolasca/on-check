// Cotización con el scoring real (BCRA en vivo con respaldo). La pyme la pone siempre el servidor cuando hay contrato (D7); sin contrato (mock) se acepta body.pyme.
import { CuitSinDatosError, cotizar, scoreLibrador } from "@/lib/scoring";
import { CONFIG_FONDO } from "@/lib/scoring/config";
import { guardarCotizacion, hayChain, ErrorApi } from "@/lib/chain";
import { TIPOS_GARANTIA, type GarantiaInput, type InputCotizacion, type ResultadoScoring, type TipoActivo } from "@/shared/types";
import { pymeDelServidor } from "../_lib/chain";
import { error, esFechaReal, esMontoDecimal, esString, leerJson } from "../_lib/http";

export const dynamic = "force-dynamic";

const MAX_BALANCE = 200_000; // caracteres de balance pegado como texto

/** Garantía opcional del pagaré/cheque: tipo conocido, descripción y valor declarado decimal. null si es inválida. */
function leerGarantia(v: unknown): GarantiaInput | null {
  if (!v || typeof v !== "object") return null;
  const g = v as Record<string, unknown>;
  if (typeof g.tipo !== "string" || !(TIPOS_GARANTIA as readonly string[]).includes(g.tipo) || g.tipo === "ninguna") return null;
  if (!esString(g.descripcion) || g.descripcion.length > 500 || !esMontoDecimal(g.valorDeclarado)) return null;
  if (g.documentos !== undefined && (!Array.isArray(g.documentos) || g.documentos.length > 20 || g.documentos.some((d) => typeof d !== "string" || d.length > 200))) return null;
  return { tipo: g.tipo as GarantiaInput["tipo"], descripcion: g.descripcion, valorDeclarado: g.valorDeclarado, ...(g.documentos ? { documentos: g.documentos as string[] } : {}) };
}

export async function POST(req: Request) {
  const body = await leerJson(req);
  if (!body || !esString(body.cuit) || !esMontoDecimal(body.nominal) || !esString(body.vencimiento)) {
    return error("DATOS_INVALIDOS", "Faltan datos: cuit, nominal y vencimiento.");
  }
  if (!esFechaReal(body.vencimiento)) return error("DATOS_INVALIDOS", "El vencimiento tiene que ser una fecha real con formato AAAA-MM-DD.");
  if (body.tipo !== undefined && body.tipo !== "cheque" && body.tipo !== "pagare") return error("DATOS_INVALIDOS", "tipo debe ser 'cheque' o 'pagare'.");
  const garantia = body.garantia === undefined ? undefined : leerGarantia(body.garantia);
  if (garantia === null) return error("DATOS_INVALIDOS", "La garantía necesita un tipo válido, una descripción y un valor declarado (string decimal).");
  if (body.balance !== undefined && (typeof body.balance !== "string" || body.balance.length > MAX_BALANCE)) return error("DATOS_INVALIDOS", "El balance tiene que ser texto de hasta 200.000 caracteres.");
  const input: InputCotizacion = {
    cuit: body.cuit,
    nominal: body.nominal,
    vencimiento: body.vencimiento,
    ...(body.tipo ? { tipo: body.tipo as TipoActivo } : {}),
    ...(garantia ? { garantia } : {}),
    ...(typeof body.balance === "string" ? { balance: body.balance } : {}),
    pyme: !hayChain() && esString(body.pyme) ? body.pyme : pymeDelServidor(),
  };
  let scoring: ResultadoScoring;
  try {
    scoring = await scoreLibrador(input.cuit);
  } catch (e) {
    if (e instanceof CuitSinDatosError) return error("CUIT_SIN_DATOS", "El BCRA no tiene datos de ese CUIT. Revisalo.", 404);
    return error("BCRA_NO_DISPONIBLE", "No pudimos consultar el BCRA ahora. Probá de nuevo en un momento.", 502);
  }
  try {
    const cot = cotizar(input, scoring, CONFIG_FONDO);
    guardarCotizacion(cot); // además la firma (cot.firma)
    return Response.json(cot);
  } catch (e) {
    if (e instanceof ErrorApi) return error(e.codigo, e.message, e.status);
    return error("DATOS_INVALIDOS", "No pudimos armar la cotización con esos datos. Revisá el CUIT, el monto y el vencimiento.");
  }
}
