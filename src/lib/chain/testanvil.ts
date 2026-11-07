// Ayudas SOLO para tests de integración: levanta anvil (chain id de Base Sepolia, reloj fijo) y despliega los contratos v2 con el
// script real del repo (`contracts/script/Deploy.s.sol`, vía `forge script`). Nada toca una red real.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Address } from "viem";

const RAIZ = process.cwd();
const ARTEFACTO = (n: string) => join(RAIZ, "contracts", "out", `${n}.sol`, `${n}.json`);

/** Hay anvil, forge y el contrato compilado: si no, los tests de integración se saltean solos. */
export const hayEntornoDeCadena =
  spawnSync("anvil", ["--version"]).status === 0 && spawnSync("forge", ["--version"]).status === 0 && ["ChequeFund", "ChequeToken", "MockARGt"].every((n) => existsSync(ARTEFACTO(n)));

// Claves públicas de prueba de anvil (no son secretas).
export const CLAVES = {
  admin: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  originador: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  oraculo: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  inversor1: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  inversor2: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  pyme: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
} as const;

export const CLAVE_DEMO = "clave-de-prueba-0123456789";
/** Martes 3-11-2026 12:00 en Buenos Aires, fijo para el reloj de JS y para anvil: los precios dependen de los días hasta el vencimiento. */
export const AHORA_FIJO_MS = Date.UTC(2026, 10, 3, 15, 0, 0);

export interface Cadena {
  rpc: string;
  fondo: Address;
  argt: Address;
  token: Address;
  parar: () => void;
}

function puertoLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

async function esperarRpc(rpc: string) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' });
      if (r.ok) return;
    } catch {
      // todavía arrancando
    }
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("anvil no arrancó");
}

/** Arranca anvil en un puerto al azar y despliega con el script real; devuelve las direcciones que imprime. */
export async function arrancarCadena(): Promise<Cadena> {
  const puerto = await puertoLibre(); // los archivos de integración corren en paralelo: cada uno con su anvil
  const rpc = `http://127.0.0.1:${puerto}`;
  const anvil: ChildProcess = spawn("anvil", ["--port", String(puerto), "--chain-id", "84532", "--timestamp", String(AHORA_FIJO_MS / 1000), "--silent"], { stdio: "ignore" });
  await esperarRpc(rpc);
  const env = {
    ...process.env,
    DEPLOYER_PRIVATE_KEY: CLAVES.admin,
    ORIGINADOR_PRIVATE_KEY: CLAVES.originador,
    ORACULO_PRIVATE_KEY: CLAVES.oraculo,
    INVERSOR1_PRIVATE_KEY: CLAVES.inversor1,
    INVERSOR2_PRIVATE_KEY: CLAVES.inversor2,
    PYME_PRIVATE_KEY: CLAVES.pyme,
    DEPLOY_OUT: "",
  };
  // forge script escribe en contracts/cache y contracts/broadcast: dos deploys a la vez (archivos de test en paralelo) se pisan. Se turnan con un candado.
  const candado = join(tmpdir(), "hackatwin-forge-deploy.lock");
  for (let i = 0; ; i++) {
    try {
      mkdirSync(candado);
      break;
    } catch {
      try {
        if (Date.now() - statSync(candado).mtimeMs > 180_000) rmSync(candado, { recursive: true, force: true }); // candado viejo de una corrida que murió
      } catch {
        // lo soltó otro justo ahora
      }
      if (i > 1800) throw new Error("No se pudo tomar el candado del deploy.");
      await new Promise((res) => setTimeout(res, 100));
    }
  }
  let salida: string;
  try {
    const r = spawnSync("forge", ["script", "script/Deploy.s.sol", "--rpc-url", rpc, "--broadcast"], { cwd: join(RAIZ, "contracts"), env, encoding: "utf8", timeout: 120_000 });
    salida = `${r.stdout}\n${r.stderr}`;
  } finally {
    rmSync(candado, { recursive: true, force: true });
  }
  const dir = (nombre: string) => {
    const m = new RegExp(`${nombre}:\\s+(0x[0-9a-fA-F]{40})`).exec(salida);
    if (!m) {
      anvil.kill();
      throw new Error(`El deploy no imprimió ${nombre}. Salida: ${salida.slice(-600)}`);
    }
    return m[1] as Address;
  };
  const cadena: Cadena = { rpc, fondo: dir("ChequeFund"), argt: dir("MockARGt"), token: dir("ChequeToken"), parar: () => anvil.kill() };
  const codigo = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [cadena.fondo, "latest"] }) }).then((r) => r.json() as Promise<{ result?: string }>);
  if (!codigo.result || codigo.result === "0x") {
    anvil.kill();
    throw new Error(`El deploy no dejó código en ${cadena.fondo} (¿falló el broadcast?). Salida: ${salida.slice(-600)}`);
  }
  return cadena;
}

/** Variables de entorno que usa la capa chain para hablar con esa cadena (el scoring y el agente van en modo real, sin modelo). */
export const entornoDeApi = (c: Cadena): Record<string, string> => ({
  BASE_SEPOLIA_RPC_URL: c.rpc,
  BASE_SEPOLIA_RPC_FALLBACK_URL: c.rpc,
  CHEQUE_FUND_ADDRESS: c.fondo,
  MOCK_ARGT_ADDRESS: c.argt,
  CHEQUE_FUND_FROM_BLOCK: "0",
  DEPLOYER_PRIVATE_KEY: CLAVES.admin,
  ORIGINADOR_PRIVATE_KEY: CLAVES.originador,
  ORACULO_PRIVATE_KEY: CLAVES.oraculo,
  INVERSOR1_PRIVATE_KEY: CLAVES.inversor1,
  INVERSOR2_PRIVATE_KEY: CLAVES.inversor2,
  PYME_PRIVATE_KEY: CLAVES.pyme,
  CUIT_SALT: "sal-de-prueba",
  DEMO_CLAVE: CLAVE_DEMO,
  AGENT_MODE: "determinista",
  SCORING_MODE: "real", // vitest.config lo deja en "mock"; acá el agente usa el scoring real (BCRA en caché) y la cartera de la cadena
  CHAIN_DEPLOYMENT_FILE: "",
});
