import { AvalancheFuji } from "@/components/AvalancheFuji";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-suave">Avalanche · Fuji</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">El mismo fondo, en otra red.</h1>
        <p className="mt-2 max-w-2xl text-sm text-suave">
          Los contratos del fondo están desplegados y verificados en Avalanche Fuji, con las mismas reglas que en Base. Conectá tu wallet y operalo desde acá.
        </p>
      </div>
      <AvalancheFuji />
    </div>
  );
}
