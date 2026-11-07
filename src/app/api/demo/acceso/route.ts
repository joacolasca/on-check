// Entrada del equipo de la demo: pide la clave (DEMO_CLAVE) y deja una cookie de sesión. HTML mínimo, sin la UI.
// La clave nunca va en la URL, en logs ni en la respuesta.
import { claveValida, crearValorSesion, cabeceraSetCookie, limitar } from "../../_lib/acceso";

export const dynamic = "force-dynamic";

const FOOTER = "Prototipo · el fondo opera en testnet, sin dinero real · no es oferta pública";

function pagina(mensaje: string | null, status = 200): Response {
  const aviso = mensaje ? `<p role="alert" style="color:#b00020">${mensaje}</p>` : "";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Acceso del equipo de la demo</title></head>
<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem">
<h1>Acceso del equipo de la demo</h1>
<p>Ingresá la clave para poder operar con las wallets de demo.</p>${aviso}
<form method="post" action="/api/demo/acceso"><label>Clave <input type="password" name="clave" autocomplete="current-password" required></label> <button type="submit">Entrar</button></form>
<footer style="margin-top:3rem;font-size:.8rem;color:#555">${FOOTER}</footer></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY" } });
}

export async function GET() {
  return pagina(null);
}

export async function POST(req: Request) {
  const limite = limitar(req, "acceso");
  if (limite) return limite;
  if (!process.env.DEMO_CLAVE || process.env.DEMO_CLAVE.length < 16) {
    // Sin clave configurada: en producción no hay acceso posible; en desarrollo no hace falta.
    if (process.env.NODE_ENV === "production") return pagina("El servidor no tiene configurada la clave de la demo.", 503);
    return new Response(null, { status: 303, headers: { location: "/demo" } });
  }
  let clave = "";
  try {
    const valor = (await req.formData()).get("clave");
    if (typeof valor === "string") clave = valor;
  } catch {
    /* cuerpo ilegible: se trata como clave vacía */
  }
  const sesion = claveValida(clave) ? crearValorSesion() : null;
  if (!sesion) return pagina("Clave incorrecta. Probá de nuevo.", 401);
  return new Response(null, { status: 303, headers: { location: "/demo", "set-cookie": cabeceraSetCookie(sesion) } });
}
