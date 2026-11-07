"use client";
// El fondo de cheques sobre Avalanche Fuji, operado desde la wallet del usuario (track Blockchain).
// Mismos contratos que en Base Sepolia (MockARGt + ChequeFund), desplegados y verificados en Fuji.
import { useEffect, useState } from "react";
import { createPublicClient, encodeFunctionData, formatUnits, http, maxUint256, type Abi, type Hex } from "viem";
import { avalanche, avalancheFuji } from "viem/chains";
import fundAbiJson from "@/shared/abi/ChequeFund.json";
import argtAbiJson from "@/shared/abi/MockARGt.json";
import { Tarjeta } from "./ui";
import { elegirWallet, type Eth } from "@/lib/wallet";
import { ARGT_AVALANCHE_MAINNET, FUJI, FUJI_CHAIN_ID_HEX, FUJI_PARAMS, ORIGINADOR_ROLE, SNOWTRACE_FUJI, chequeDemo } from "@/lib/avalanche";

const fundAbi = fundAbiJson as Abi;
const argtAbi = argtAbiJson as Abi;
const fuji = createPublicClient({ chain: avalancheFuji, transport: http() });
const mainnet = createPublicClient({ chain: avalanche, transport: http() });
const erc20Lectura = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

interface Paso { titulo: string; hash?: string; estado?: string }
interface Lectura { totalAssets: string; misCuotapartes: string; miMargt: string; kyc: boolean; originador: boolean; cheque?: string }

const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString("es-AR", { maximumFractionDigits: 2 });

export function AvalancheFuji() {
  const [w, setW] = useState<{ eth: Eth; nombre: string } | null>(null);
  const [cuenta, setCuenta] = useState<`0x${string}` | null>(null);
  const [fund, setFund] = useState<string>(FUJI.chequeFund);
  const [argt, setArgt] = useState<string>(FUJI.mockARGt);
  const [pyme, setPyme] = useState("");
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [argtReal, setArgtReal] = useState<string | null>(null);

  useEffect(() => {
    mainnet
      .readContract({ address: ARGT_AVALANCHE_MAINNET, abi: erc20Lectura, functionName: "totalSupply" })
      .then((v) => setArgtReal(fmt(v)))
      .catch(() => setArgtReal(null));
  }, []);

  const listo = !!(cuenta && /^0x[0-9a-fA-F]{40}$/.test(fund) && /^0x[0-9a-fA-F]{40}$/.test(argt));

  async function leer(c = cuenta) {
    if (!c || !listo) return;
    const f = fund as `0x${string}`;
    const etiqueta = c.toLowerCase();
    const ch = chequeDemo((pyme || c) as `0x${string}`, 0n, etiqueta);
    const [ta, cuot, mar, kyc, orig, datos] = await Promise.all([
      fuji.readContract({ address: f, abi: fundAbi, functionName: "totalAssets" }) as Promise<bigint>,
      fuji.readContract({ address: f, abi: fundAbi, functionName: "balanceOf", args: [c] }) as Promise<bigint>,
      fuji.readContract({ address: argt as `0x${string}`, abi: argtAbi, functionName: "balanceOf", args: [c] }) as Promise<bigint>,
      fuji.readContract({ address: f, abi: fundAbi, functionName: "kyc", args: [c] }) as Promise<boolean>,
      fuji.readContract({ address: f, abi: fundAbi, functionName: "hasRole", args: [ORIGINADOR_ROLE, c] }) as Promise<boolean>,
      fuji.readContract({ address: f, abi: fundAbi, functionName: "cheques", args: [ch.id] }).catch(() => null) as Promise<{ estado: number } | null>,
    ]);
    const estados = ["Sin registrar", "Pendiente", "Fondeado", "Pagado", "Rechazado"];
    setLectura({ totalAssets: fmt(ta), misCuotapartes: fmt(cuot), miMargt: fmt(mar), kyc, originador: orig, cheque: datos ? estados[Number(datos.estado)] : undefined });
  }

  async function conectar() {
    setError(null);
    const elegida = await elegirWallet();
    if (!elegida) return setError("No encontramos una wallet (MetaMask).");
    try {
      const [c] = (await elegida.eth.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
      try {
        await elegida.eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: FUJI_CHAIN_ID_HEX }] });
      } catch {
        await elegida.eth.request({ method: "wallet_addEthereumChain", params: [FUJI_PARAMS] });
      }
      setW(elegida);
      setCuenta(c);
    } catch (e) {
      setError(`No se pudo conectar: ${(e as Error).message}`);
    }
  }

  const actualizar = () => leer().catch((e) => setError(`No se pudo leer el contrato: ${(e as Error).message}`));

  async function enviar(titulo: string, to: string, data: Hex) {
    if (!w || !cuenta) throw new Error("Conectá la wallet");
    await w.eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: FUJI_CHAIN_ID_HEX }] });
    setPasos((p) => [...p, { titulo, estado: "Confirmá en tu wallet…" }]);
    const hash = (await w.eth.request({ method: "eth_sendTransaction", params: [{ from: cuenta, to, data }] })) as Hex;
    setPasos((p) => p.map((x, i) => (i === p.length - 1 ? { ...x, hash, estado: "Enviada…" } : x)));
    const r = await fuji.waitForTransactionReceipt({ hash });
    setPasos((p) => p.map((x, i) => (i === p.length - 1 ? { ...x, estado: r.status === "success" ? "Confirmada" : "Revirtió" } : x)));
    if (r.status !== "success") throw new Error(`${titulo}: la transacción revirtió`);
  }

  async function correr(fn: () => Promise<void>) {
    setError(null);
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
      await leer().catch(() => undefined);
    }
  }

  const f = fund as `0x${string}`;
  const a = argt as `0x${string}`;
  const preparar = () =>
    correr(async () => {
      if (!cuenta) return;
      if (!lectura?.kyc) await enviar("KYC del inversor (admin)", f, encodeFunctionData({ abi: fundAbi, functionName: "setKyc", args: [cuenta, true] }));
      if (!lectura?.originador)
        await enviar("Rol de originador (admin)", f, encodeFunctionData({ abi: fundAbi, functionName: "grantRole", args: [ORIGINADOR_ROLE, cuenta] }));
      await enviar("Cargar 1.000.000 mARGt de testnet", a, encodeFunctionData({ abi: argtAbi, functionName: "mint", args: [cuenta, 1_000_000n * 10n ** 18n] }));
      await enviar("Autorizar al fondo a usar mARGt", a, encodeFunctionData({ abi: argtAbi, functionName: "approve", args: [f, maxUint256] }));
    });
  const invertir = () =>
    correr(async () => {
      if (!cuenta) return;
      await enviar("Invertir 500.000 mARGt en el fondo", f, encodeFunctionData({ abi: fundAbi, functionName: "deposit", args: [500_000n * 10n ** 18n, cuenta] }));
    });
  const cheque = () =>
    correr(async () => {
      if (!cuenta) return;
      const destino = (/^0x[0-9a-fA-F]{40}$/.test(pyme) ? pyme : cuenta) as `0x${string}`;
      const ch = chequeDemo(destino, BigInt(Math.floor(Date.now() / 1000)), cuenta.toLowerCase());
      const { id, ...datos } = ch;
      await enviar("Registrar el cheque (Pendiente)", f, encodeFunctionData({ abi: fundAbi, functionName: "registrarCheque", args: [id, { ...datos, estado: 0 }] }));
      await enviar("Fondear el cheque: el fondo paga a la pyme", f, encodeFunctionData({ abi: fundAbi, functionName: "fondearCheque", args: [id] }));
    });

  return (
    <div className="space-y-4">
      <Tarjeta titulo="El fondo de cheques en Avalanche (Fuji)">
        <p className="text-sm text-suave">
          Los mismos contratos del fondo, desplegados y verificados en Avalanche Fuji (testnet, sin dinero real). Desde acá se opera con tu wallet:
          KYC, inversión, registro de un cheque y compra, con las reglas que hace cumplir el contrato.
        </p>
        <p className="mt-2 text-xs text-suave">
          ARGt real de Twin ya circula en Avalanche C-Chain:{" "}
          <a className="underline" href={`https://snowtrace.io/token/${ARGT_AVALANCHE_MAINNET}`} target="_blank" rel="noreferrer">
            {ARGT_AVALANCHE_MAINNET}
          </a>{" "}
          {argtReal && <>· supply leída ahora: {argtReal} ARGt</>}
        </p>
      </Tarjeta>

      <Tarjeta titulo="Contratos en Fuji">
        <div className="grid gap-2 text-sm">
          <label className="grid gap-1">
            ChequeFund
            <input className="rounded-ui border border-linea bg-panel-2 px-3 py-2 font-mono" value={fund} onChange={(e) => setFund(e.target.value.trim())} placeholder="0x…" />
          </label>
          <label className="grid gap-1">
            MockARGt
            <input className="rounded-ui border border-linea bg-panel-2 px-3 py-2 font-mono" value={argt} onChange={(e) => setArgt(e.target.value.trim())} placeholder="0x…" />
          </label>
          {listo && (
            <p className="text-xs text-suave">
              <a className="underline" href={`${SNOWTRACE_FUJI}/address/${fund}#code`} target="_blank" rel="noreferrer">ChequeFund en Snowtrace</a> ·{" "}
              <a className="underline" href={`${SNOWTRACE_FUJI}/address/${argt}#code`} target="_blank" rel="noreferrer">MockARGt en Snowtrace</a>
            </p>
          )}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Tu wallet">
        {cuenta ? (
          <p className="text-sm">
            {w?.nombre} · <span className="font-mono">{cuenta}</span>
          </p>
        ) : (
          <button className="rounded-ui bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario" onClick={conectar}>
            Conectar MetaMask (Avalanche Fuji)
          </button>
        )}
        {lectura && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-suave">Patrimonio del fondo</dt><dd className="tabular-nums">{lectura.totalAssets} mARGt</dd>
            <dt className="text-suave">Tus cuotapartes</dt><dd className="tabular-nums">{lectura.misCuotapartes} cCHQ</dd>
            <dt className="text-suave">Tu mARGt</dt><dd className="tabular-nums">{lectura.miMargt}</dd>
            <dt className="text-suave">KYC aprobado</dt><dd>{lectura.kyc ? "Sí" : "No"}</dd>
            <dt className="text-suave">Originador</dt><dd>{lectura.originador ? "Sí" : "No"}</dd>
            <dt className="text-suave">Cheque de demo</dt><dd>{lectura.cheque ?? "—"}</dd>
          </dl>
        )}
      </Tarjeta>

      <Tarjeta titulo="Operar el fondo">
        <label className="mb-3 grid gap-1 text-sm">
          Wallet de la pyme que cobra el cheque (opcional; si no, la tuya)
          <input className="rounded-ui border border-linea bg-panel-2 px-3 py-2 font-mono" value={pyme} onChange={(e) => setPyme(e.target.value.trim())} placeholder="0x…" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-ui border border-linea px-3 py-2 text-sm disabled:opacity-50" disabled={!listo || ocupado} onClick={actualizar}>Leer el contrato</button>
          <button className="rounded-ui border border-linea px-3 py-2 text-sm disabled:opacity-50" disabled={!listo || ocupado} onClick={preparar}>1 · KYC, rol y mARGt</button>
          <button className="rounded-ui border border-linea px-3 py-2 text-sm disabled:opacity-50" disabled={!listo || ocupado} onClick={invertir}>2 · Invertir 500.000</button>
          <button className="rounded-ui bg-primario px-3 py-2 text-sm font-semibold text-sobre-primario disabled:opacity-50" disabled={!listo || ocupado} onClick={cheque}>3 · Registrar y fondear un cheque</button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-estado-rechazado-tx">{error}</p>}
        {pasos.length > 0 && (
          <ol className="mt-3 space-y-1 text-sm">
            {pasos.map((p, i) => (
              <li key={i}>
                {p.titulo}: {p.estado}{" "}
                {p.hash && (
                  <a className="break-all font-mono underline" href={`${SNOWTRACE_FUJI}/tx/${p.hash}`} target="_blank" rel="noreferrer">{p.hash}</a>
                )}
              </li>
            ))}
          </ol>
        )}
      </Tarjeta>
    </div>
  );
}
