import { describe, expect, it } from "vitest";
import { buscarSecretos, scriptsDelHtml, verificarDeploy } from "./verificar-deploy.mjs";

const despliegue = {
  chequeFund: "0xAAAA000000000000000000000000000000000001",
  admin: "0x0000000000000000000000000000000000000a01",
  originador: "0x0000000000000000000000000000000000000a02",
  oraculo: "0x0000000000000000000000000000000000000a03",
  inversor1: "0x0000000000000000000000000000000000000a04",
  inversor2: "0x0000000000000000000000000000000000000a05",
  pyme: "0x0000000000000000000000000000000000000a06",
};

function app(opc: { postStatus?: number; js?: string } = {}) {
  const fetchFn = async (url: string, init?: RequestInit) => {
    const ruta = url.replace("http://app", "");
    const r = (t: string, s = 200) => new Response(t, { status: s });
    if (init?.method === "POST") return r("{}", opc.postStatus ?? 401);
    if (ruta === "/api/fondo") return r(JSON.stringify({ contrato: despliegue.chequeFund.toLowerCase() }));
    if (ruta === "/api/demo/cuentas") return r(JSON.stringify(Object.values(despliegue).slice(1)));
    if (ruta === "/api/argt-real") return r("{}");
    if (ruta === "/") return r('<script src="/_next/static/a.js"></script>');
    if (ruta === "/_next/static/a.js") return r(opc.js ?? "console.log(1)");
    return r("", 404);
  };
  return fetchFn as unknown as typeof fetch;
}

describe("verificar deploy", () => {
  it("todo en orden", async () => {
    const r = await verificarDeploy({ base: "http://app", despliegue, fetchFn: app() });
    expect(r.filter((x) => !x.pasa)).toEqual([]);
  });
  it("falla si las rutas que firman aceptan sin clave", async () => {
    const r = await verificarDeploy({ base: "http://app", despliegue, fetchFn: app({ postStatus: 200 }) });
    expect(r.filter((x) => !x.pasa).map((x) => x.nombre)).toEqual(["POST /api/demo/kyc sin clave es rechazado", "POST /api/cheques sin clave es rechazado"]);
  });
  it("falla si el JS del cliente contiene una clave privada", async () => {
    const r = await verificarDeploy({ base: "http://app", despliegue, fetchFn: app({ js: `x="0x${"ab".repeat(32)}"` }) });
    expect(r.find((x) => !x.pasa)?.nombre).toMatch(/filtra secretos/);
  });
  it("detecta patrones y scripts", () => {
    expect(buscarSecretos("sk-or-v1-abcdefghijkl")).toEqual(["API key de OpenRouter"]);
    expect(buscarSecretos("0x" + "a".repeat(40))).toEqual([]);
    expect(scriptsDelHtml('<script src="/_next/x.js"></script><script src="/_next/x.js"></script>')).toEqual(["/_next/x.js"]);
  });
});
