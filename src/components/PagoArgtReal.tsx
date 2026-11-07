"use client";
// Paga un cheque con ARGt real en Arbitrum One desde la wallet del usuario (MetaMask).
// La app arma la transacción; el usuario la confirma en su wallet. Monto chico y con tope.
import { useState } from "react";
import { createPublicClient, formatUnits, http } from "viem";
import { arbitrum } from "viem/chains";
import { Tarjeta } from "./ui";
import { ARBISCAN, ARBITRUM_CHAIN_ID_HEX, ARGT_ARBITRUM, MAX_ARGT_DEMO, armarPagoArgt, type ErrorPago } from "@/lib/argt-real";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
type Detalle = { info: { rdns: string; name: string }; provider: Eth };
let elegida: Eth | undefined;
let nombreWallet = "";
// EIP-6963: con varias wallets instaladas (MetaMask, Rabby…) se elige MetaMask explícitamente.
function descubrirWallets(): Promise<Detalle[]> {
  return new Promise((ok) => {
    const vistas: Detalle[] = [];
    const al = (e: Event) => vistas.push((e as CustomEvent<Detalle>).detail);
    window.addEventListener("eip6963:announceProvider", al);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", al);
      ok(vistas);
    }, 300);
  });
}
async function elegirWallet(): Promise<Eth | undefined> {
  const vistas = await descubrirWallets();
  const mm = vistas.find((d) => d.info.rdns === "io.metamask");
  const d = mm ?? vistas[0];
  elegida = d?.provider ?? (globalThis as { ethereum?: Eth }).ethereum;
  nombreWallet = d?.info.name ?? "wallet del navegador";
  return elegida;
}
const eth = (): Eth | undefined => elegida;
const cliente = createPublicClient({ chain: arbitrum, transport: http() });

const MENSAJES: Record<ErrorPago, string> = {
  DESTINO_INVALIDO: "La dirección de destino no es válida.",
  MONTO_INVALIDO: "Ingresá un monto mayor a cero (ej: 10 o 1.5).",
  MONTO_EXCEDE_TOPE: `En la demo el tope es ${MAX_ARGT_DEMO} ARGt.`,
  REFERENCIA_VACIA: "Poné la referencia del cheque.",
};

interface Resultado { hash: string; bloque?: string; estado?: string; memo: string }

export function PagoArgtReal() {
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [saldo, setSaldo] = useState<string | null>(null);
  const [destino, setDestino] = useState("");
  const [monto, setMonto] = useState("10");
  const [referencia, setReferencia] = useState("CH-DEMO-001");
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);

  async function leerSaldo(dir: string) {
    const v = await cliente.readContract({
      address: ARGT_ARBITRUM,
      abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }],
      functionName: "balanceOf",
      args: [dir as `0x${string}`],
    });
    setSaldo(formatUnits(v, 18));
  }

  async function conectar() {
    setError(null);
    const w = await elegirWallet();
    if (!w) return setError("No encontramos una wallet en el navegador (MetaMask).");
    try {
      const [c] = (await w.request({ method: "eth_requestAccounts" })) as string[];
      await w.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }] });
      setCuenta(c);
      await leerSaldo(c);
    } catch (e) {
      setError(`No se pudo conectar: ${(e as Error).message}`);
    }
  }

  async function pagar() {
    setError(null);
    setRes(null);
    const w = eth();
    if (!w || !cuenta) return;
    const pago = armarPagoArgt(destino, monto, referencia);
    if ("error" in pago) return setError(MENSAJES[pago.error]);
    try {
      await w.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }] });
      setEstado("Confirmá la transacción en tu wallet…");
      const hash = (await w.request({ method: "eth_sendTransaction", params: [{ from: cuenta, to: pago.to, data: pago.data }] })) as `0x${string}`;
      setRes({ hash, memo: pago.memo });
      setEstado("Enviada. Esperando confirmación en Arbitrum…");
      const recibo = await cliente.waitForTransactionReceipt({ hash });
      setRes({ hash, memo: pago.memo, bloque: recibo.blockNumber.toString(), estado: recibo.status });
      setEstado(recibo.status === "success" ? "Confirmada onchain." : "La transacción revirtió.");
      await leerSaldo(cuenta);
    } catch (e) {
      setEstado(null);
      setError(`No se envió: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Pago de un cheque en ARGt real · Arbitrum One">
        <p className="text-sm text-suave">
          Esta es la única pantalla que usa la red principal: mueve ARGt real (moneda local tokenizada por Twin) desde tu wallet, con un tope
          de {MAX_ARGT_DEMO} ARGt. El resto del prototipo sigue en testnet. La referencia del cheque viaja en la transacción como un hash, sin
          datos personales.
        </p>
        <p className="mt-2 text-xs text-suave">
          Token: ARGt en Arbitrum ·{" "}
          <a className="underline" href={`${ARBISCAN}/token/${ARGT_ARBITRUM}`} target="_blank" rel="noreferrer">
            {ARGT_ARBITRUM}
          </a>
        </p>
      </Tarjeta>

      <Tarjeta titulo="1 · Conectá tu wallet">
        {cuenta ? (
          <p className="text-sm">
            Wallet: {nombreWallet}
            <br />
            Cuenta <span className="font-mono">{cuenta}</span>
            <br />
            Saldo: <span className="tabular-nums">{saldo ?? "…"}</span> ARGt
          </p>
        ) : (
          <button className="rounded-ui bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario" onClick={conectar}>
            Conectar MetaMask (Arbitrum)
          </button>
        )}
      </Tarjeta>

      <Tarjeta titulo="2 · Pagá el cheque">
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">
            Destino (wallet que cobra)
            <input className="rounded-ui border border-linea bg-panel-2 px-3 py-2 font-mono" value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="0x…" />
          </label>
          <label className="grid gap-1">
            Monto en ARGt
            <input className="rounded-ui border border-linea bg-panel-2 px-3 py-2 tabular-nums" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" />
          </label>
          <label className="grid gap-1">
            Referencia del cheque
            <input className="rounded-ui border border-linea bg-panel-2 px-3 py-2" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          </label>
          <button
            className="rounded-ui bg-primario px-4 py-2 font-semibold text-sobre-primario disabled:opacity-50"
            disabled={!cuenta}
            onClick={pagar}
          >
            Pagar con ARGt real
          </button>
        </div>
        {estado && <p role="status" className="mt-3 text-sm">{estado}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-estado-rechazado-tx">{error}</p>}
      </Tarjeta>

      {res && (
        <Tarjeta titulo="Comprobante onchain">
          <dl className="grid gap-1 text-sm">
            <dt className="text-suave">Hash</dt>
            <dd className="break-all font-mono">
              <a className="underline" href={`${ARBISCAN}/tx/${res.hash}`} target="_blank" rel="noreferrer">{res.hash}</a>
            </dd>
            <dt className="text-suave">Referencia (hash del cheque, al final del calldata)</dt>
            <dd className="break-all font-mono">{res.memo}</dd>
            {res.bloque && (<><dt className="text-suave">Bloque</dt><dd className="font-mono">{res.bloque} · {res.estado}</dd></>)}
          </dl>
        </Tarjeta>
      )}
    </div>
  );
}
