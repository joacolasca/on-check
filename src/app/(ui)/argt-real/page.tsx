import Link from "next/link";
import { PagoArgtReal } from "@/components/PagoArgtReal";
import { TX_ARGT_REAL } from "@/components/Portada";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-suave">ARGt de Twin · Arbitrum One</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Pagar un cheque con pesos onchain.</h1>
        <p className="mt-2 max-w-2xl text-sm text-suave">
          El pago viaja en ARGt real, con la referencia del cheque dentro de la transacción. Ya hicimos uno:{" "}
          <a className="underline underline-offset-2" href={`https://arbiscan.io/tx/${TX_ARGT_REAL}`} target="_blank" rel="noopener noreferrer">verlo en Arbiscan ↗</a>.{" "}
          El resto del fondo corre en testnet: <Link className="underline underline-offset-2" href="/">volver al panel</Link>.
        </p>
      </div>
      <PagoArgtReal />
    </div>
  );
}
