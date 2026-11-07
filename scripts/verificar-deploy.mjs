// Verifica un deploy SIN modificar nada del fondo (solo GET, y dos POST sin credenciales que deben ser rechazados).
//   1. /api/fondo responde y menciona el contrato del deploy (shared/deployments/base-sepolia.json)
//   2. /api/demo/cuentas devuelve las 6 cuentas con las direcciones desplegadas
//   3. /api/argt-real responde
//   4. las rutas que escriben en la cadena, sin clave, devuelven 401/403 (con cuerpo vacío: aunque fallara la protección, no hace nada)
//   5. el JavaScript que baja el navegador no contiene claves privadas ni API keys
// Uso: node scripts/verificar-deploy.mjs https://tu-app.vercel.app
//   DEPLOY_JSON=ruta/al/despliegue.json para verificar contra otro despliegue (por ejemplo la copia de ensayo)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PATRONES_SECRETOS = [
  { nombre: "clave privada (0x + 64 hex)", re: /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/ },
  { nombre: "API key de OpenRouter", re: /sk-or-[A-Za-z0-9_-]{10,}/ },
  { nombre: "API key de Anthropic", re: /sk-ant-[A-Za-z0-9_-]{10,}/ },
];

/** Devuelve los patrones de secretos que aparecen en `texto`. */
export function buscarSecretos(texto) {
  return PATRONES_SECRETOS.filter((p) => p.re.test(texto)).map((p) => p.nombre);
}

/** Rutas de scripts (`/_next/...js`) referenciadas por el HTML. */
export function scriptsDelHtml(html) {
  return [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/[^"]+\.js[^"]*)"/g)].map((m) => m[1]))];
}

export async function verificarDeploy({ base, despliegue, fetchFn = fetch }) {
  const resultados = [];
  const ok = (nombre, pasa, detalle = "") => resultados.push({ nombre, pasa, detalle });
  const pedir = async (metodo, ruta, body) => {
    const res = await fetchFn(`${base}${ruta}`, {
      method: metodo,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, texto: await res.text() };
  };
  const tieneDireccion = (texto, dir) => texto.toLowerCase().includes(String(dir).toLowerCase());

  const fondo = await pedir("GET", "/api/fondo");
  ok("GET /api/fondo responde 200", fondo.status === 200, `status ${fondo.status}`);
  ok("/api/fondo apunta al contrato desplegado", tieneDireccion(fondo.texto, despliegue.chequeFund));

  const cuentas = await pedir("GET", "/api/demo/cuentas");
  ok("GET /api/demo/cuentas responde 200", cuentas.status === 200, `status ${cuentas.status}`);
  const faltan = ["admin", "originador", "oraculo", "inversor1", "inversor2", "pyme"].filter((k) => !tieneDireccion(cuentas.texto, despliegue[k]));
  ok("las 6 cuentas coinciden con el despliegue", faltan.length === 0, faltan.length ? `no aparecen: ${faltan.join(", ")}` : "");

  const argt = await pedir("GET", "/api/argt-real");
  ok("GET /api/argt-real responde 200", argt.status === 200, `status ${argt.status}`);

  for (const ruta of ["/api/demo/kyc", "/api/cheques"]) {
    const r = await pedir("POST", ruta, {});
    ok(`POST ${ruta} sin clave es rechazado`, r.status === 401 || r.status === 403, `status ${r.status}`);
  }

  const home = await pedir("GET", "/");
  ok("GET / responde 200", home.status === 200, `status ${home.status}`);
  const filtrados = [];
  for (const ruta of scriptsDelHtml(home.texto)) {
    const js = await pedir("GET", ruta);
    for (const nombre of buscarSecretos(js.texto)) filtrados.push(`${nombre} en ${ruta}`);
  }
  ok("el JavaScript del cliente no filtra secretos", filtrados.length === 0, filtrados.join("; "));
  return resultados;
}

async function main() {
  const base = (process.argv[2] ?? "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(base)) {
    console.error("Uso: node scripts/verificar-deploy.mjs https://tu-app.vercel.app");
    process.exit(2);
  }
  const archivo = process.env.DEPLOY_JSON ?? fileURLToPath(new URL("../shared/deployments/base-sepolia.json", import.meta.url));
  const despliegue = JSON.parse(readFileSync(archivo, "utf8"));
  const resultados = await verificarDeploy({ base, despliegue });
  for (const r of resultados) console.log(`${r.pasa ? "OK  " : "FALLA"} ${r.nombre}${r.detalle ? ` (${r.detalle})` : ""}`);
  const fallas = resultados.filter((r) => !r.pasa).length;
  console.log(fallas ? `\n${fallas} verificaciones fallaron.` : "\nTodo en orden.");
  process.exit(fallas ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
