// Wallet del navegador para las pantallas onchain del usuario (Arbitrum real, Avalanche Fuji).
// EIP-6963: con varias wallets instaladas (MetaMask, Rabby…) se elige MetaMask explícitamente.
export type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
type Detalle = { info: { rdns: string; name: string }; provider: Eth };

function descubrir(): Promise<Detalle[]> {
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

export async function elegirWallet(): Promise<{ eth: Eth; nombre: string } | null> {
  const vistas = await descubrir();
  const d = vistas.find((v) => v.info.rdns === "io.metamask") ?? vistas[0];
  if (d) return { eth: d.provider, nombre: d.info.name };
  const legado = (globalThis as { ethereum?: Eth }).ethereum;
  return legado ? { eth: legado, nombre: "wallet del navegador" } : null;
}
