// Bloque mínimo por navegador: tras una escritura se guarda en una cookie el bloque del recibo; las lecturas siguientes
// no devuelven nada leído en un bloque anterior (Infura reparte pedidos entre nodos y en Vercel hay varias instancias).
export const COOKIE_BLOQUE = "fc_bloque";
const MAX_AGE_S = 600;

/** Bloque de la cookie del pedido; solo se acepta un entero decimal (cualquier otra cosa se ignora). */
export function bloqueDeCookie(req?: Request): bigint | undefined {
  const cabecera = req?.headers.get("cookie");
  if (!cabecera) return undefined;
  for (const par of cabecera.split(";")) {
    const i = par.indexOf("=");
    if (i < 0 || par.slice(0, i).trim() !== COOKIE_BLOQUE) continue;
    const valor = par.slice(i + 1).trim();
    return /^\d{1,18}$/.test(valor) ? BigInt(valor) : undefined;
  }
  return undefined;
}

/** Corre una ruta de escritura; si se confirmó alguna tx, deja en la respuesta la cookie con el mayor bloque conocido. */
export async function conEscritura(req: Request, hacer: (alBloque: (bloque: bigint) => void) => Promise<Response>): Promise<Response> {
  let escrito: bigint | undefined;
  const res = await hacer((b) => {
    if (escrito === undefined || b > escrito) escrito = b;
  });
  if (escrito === undefined) return res;
  const previo = bloqueDeCookie(req);
  const bloque = previo !== undefined && previo > escrito ? previo : escrito;
  res.headers.append("set-cookie", `${COOKIE_BLOQUE}=${bloque}; Path=/; Max-Age=${MAX_AGE_S}; HttpOnly; SameSite=Lax`);
  return res;
}
