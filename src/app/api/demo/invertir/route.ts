// El inversor de demo suscribe cuotapartes enteras (mínimo 1.000, de a 1): se mintea mARGt, aprueba el monto exacto y hace `mint`.
// Acepta { cuenta, cuotapartes } o, por compatibilidad, { cuenta, monto } (pesos). Devuelve { tx, shares, monto } realmente suscriptos.
// Topes (la wallet mintea mARGt gratis, así que se acota): por operación y tamaño total del fondo.
import poolDemo from "@fixtures/cheques-demo.json";
import { parseUnits } from "viem";
import { invalidarEstado, invertir, leerCartera, resolverSuscripcion, type PedidoSuscripcion } from "@/lib/chain";
import { exigirAcceso } from "../../_lib/acceso";
import { bloqueDeCookie, conEscritura } from "../../_lib/bloque";
import { conChain } from "../../_lib/chain";
import { error, leerJson } from "../../_lib/http";
import { suscribirMock, valorCuotaparteMockWei } from "../../_lib/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Por operación: el mayor depósito del pool de demo (fixture, no hardcodeado).
const TOPE_OPERACION = [poolDemo.pool_demo.inversor1_deposito, poolDemo.pool_demo.inversor2_deposito].map((m) => parseUnits(m, 18)).reduce((a, b) => (b > a ? b : a));
// Tamaño del fondo tras el depósito. 105.000.000 (v2, 6-11-2026): pool de partida de 100.000.000 + un depósito chico en vivo.
// Con el tope del 10 % por emisor, el segundo cheque de MercadoLibre (exposición ~12,5 M) sigue revirtiendo mientras el
// patrimonio sea menor a ~124 M, así que el margen es amplio (ver shared/fixtures/cheques-demo.json). TODO(confirmar con Joaquín).
const TOPE_FONDO_POR_DEFECTO = "105000000";

function topeFondo(): bigint {
  const v = process.env.DEMO_TOPE_FONDO?.trim();
  return parseUnits(v && /^\d+(\.\d{1,2})?$/.test(v) ? v : TOPE_FONDO_POR_DEFECTO, 18);
}

const pesos = (wei: bigint) => (wei / 10n ** 18n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export async function POST(req: Request) {
  const denegado = exigirAcceso(req);
  if (denegado) return denegado;
  const body = await leerJson(req);
  if (!body || (body.cuenta !== "inversor1" && body.cuenta !== "inversor2")) {
    return error("DATOS_INVALIDOS", "Faltan cuenta ('inversor1' | 'inversor2') y cuotapartes (entero, como string) o monto (pesos, string decimal).");
  }
  const { cuenta } = body;
  // Se suscriben cuotapartes enteras (mínimo 1.000, de a 1). `monto` en pesos se acepta por compatibilidad (preparar-demo): se
  // convierte a floor(monto / valorCuotaparte) cuotapartes y se suscribe exactamente esa cantidad.
  let pedido: PedidoSuscripcion;
  if (typeof body.cuotapartes === "string") {
    if (!/^\d{1,12}$/.test(body.cuotapartes) || BigInt(body.cuotapartes) <= 0n) {
      return error("CUOTAPARTES_ENTERAS", "Las cuotapartes tienen que ser un número entero positivo (de a 1, sin fracciones).");
    }
    pedido = { cuotapartes: BigInt(body.cuotapartes).toString() };
  } else if (typeof body.monto === "string") {
    if (!/^\d+(\.\d{1,2})?$/.test(body.monto)) return error("DATOS_INVALIDOS", "El monto tiene que ser un número decimal con hasta 2 decimales.");
    const wei = parseUnits(body.monto, 18);
    if (wei <= 0n) return error("DATOS_INVALIDOS", "El monto tiene que ser mayor a cero.");
    if (wei > TOPE_OPERACION) return error("DATOS_INVALIDOS", `En la demo, cada depósito puede ser de hasta $ ${pesos(TOPE_OPERACION)}.`);
    pedido = { monto: body.monto };
  } else {
    return error("DATOS_INVALIDOS", "Faltan cuotapartes (entero, como string) o monto (pesos, string decimal).");
  }
  const exigirTopeOperacion = (costoWei: bigint): Response | null =>
    costoWei > TOPE_OPERACION ? error("DATOS_INVALIDOS", `En la demo, cada suscripción puede ser de hasta $ ${pesos(TOPE_OPERACION)}.`) : null;
  return conEscritura(req, (alBloque) =>
    conChain(
      async (cfg) => {
        invalidarEstado(); // el tope se mide contra el fondo de ahora, no contra una lectura vieja
        const cartera = await leerCartera(cfg, bloqueDeCookie(req));
        const valor = parseUnits(cartera.valorCuotaparte, 18);
        const cuotapartes = resolverSuscripcion(pedido, valor); // revierte con MINIMO_CUOTAPARTES antes de firmar nada
        const costo = cuotapartes * valor; // estimado al valor de hoy
        const tope = exigirTopeOperacion(costo);
        if (tope) return tope;
        const actual = parseUnits(cartera.totalAssets, 18);
        if (actual + costo > topeFondo()) return error("DATOS_INVALIDOS", `En la demo, el fondo no puede superar $ ${pesos(topeFondo())}. Hoy tiene $ ${pesos(actual)}.`);
        return Response.json(await invertir(cfg, cuenta, { cuotapartes: cuotapartes.toString() }, alBloque));
      },
      () => {
        const tope = "cuotapartes" in pedido ? exigirTopeOperacion(BigInt(pedido.cuotapartes) * valorCuotaparteMockWei()) : null;
        return tope ?? Response.json(suscribirMock(cuenta, pedido));
      },
    ),
  );
}
