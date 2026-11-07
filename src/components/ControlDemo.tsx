"use client";
import { useState } from "react";
import type { ChequeVista, CuentaDemoEstado, RescateVista, ResumenFondo, RolCuentaDemo } from "@/shared/types";
import { api, mensajeDeError, type ErrorUi } from "@/lib/api-client";
import { chequesLiquidables, leerResultadoRescates, resumenPorEstado, textoResultado, type ResultadoLiquidacion, type ResultadoRescates } from "@/lib/demo";
import { formatDecimal, formatFecha, formatPesos, hashCorto, urlDireccionSepolia, urlTx } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { TablaRescates } from "./TablaRescates";
import { Boton, Cargando, ErrorApiCaja, ErrorCaja, EstadoBadge, LinkBaseScan, Monto, Tarjeta } from "./ui";

type Aviso = { tipo: "ok"; resultado: ResultadoLiquidacion; tx: string } | { tipo: "error"; error: ErrorUi };

function FilaCheque({ c, aviso, enCurso, onLiquidar }: { c: ChequeVista; aviso?: Aviso; enCurso: boolean; onLiquidar: (r: ResultadoLiquidacion) => void }) {
  return (
    <li className="rounded-2xl border border-linea bg-panel-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-suave">{c.tipo === "pagare" ? "Pagaré" : "Cheque"} · {c.emisorNombre ?? <span className="font-mono">{c.libradorHashCorto}</span>}</span>
        <EstadoBadge estado={c.estado} />
      </div>
      <p className="mt-1 text-sm">
        <Monto valor={c.nominal} /> <span className="text-suave">· vence el {formatFecha(c.vencimiento)}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Boton onClick={() => onLiquidar("pagado")} disabled={enCurso}>{enCurso ? "Procesando…" : "Adelantar tiempo: pagado"}</Boton>
        <Boton onClick={() => onLiquidar("rechazado")} disabled={enCurso}>Adelantar tiempo: rechazado</Boton>
      </div>
      {aviso?.tipo === "ok" && (
        <p role="status" className="mt-2 text-xs text-estado-pagado-tx">
          {textoResultado(aviso.resultado)} <LinkBaseScan href={urlTx(aviso.tx)}>{hashCorto(aviso.tx)} ↗</LinkBaseScan>
        </p>
      )}
      {aviso?.tipo === "error" && <div className="mt-2"><ErrorApiCaja error={aviso.error} /></div>}
    </li>
  );
}

const NOMBRE_CUENTA: Record<RolCuentaDemo, string> = {
  pyme: "Pyme",
  inversor1: "Inversor 1",
  inversor2: "Inversor 2",
  originador: "Originador (backend)",
  oraculo: "Oráculo (adelantar tiempo)",
  admin: "Admin (KYC y despliegue)",
};
// Las wallets que firman transacciones necesitan ETH de Base Sepolia para el gas.
const ROLES_QUE_PAGAN_GAS: RolCuentaDemo[] = ["originador", "oraculo", "admin", "inversor1", "inversor2"];
const GAS_MINIMO = 0.001;

function CuentasDemo() {
  const r = useApi<CuentaDemoEstado[]>("/api/demo/cuentas");
  if (r.estado === "cargando") return <Cargando lineas={3} />;
  if (r.estado === "error") return <ErrorCaja mensaje={r.mensaje} onReintentar={r.recargar} />;
  return (
    <div className="space-y-3">
      <ul>
        {r.datos.map((c) => {
          const sinGas = ROLES_QUE_PAGAN_GAS.includes(c.id) && Number(c.eth) < GAS_MINIMO;
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-linea py-3 first:border-t-0">
              <div className="min-w-0">
                <div className="text-sm font-medium">{NOMBRE_CUENTA[c.id]}</div>
                <LinkBaseScan href={urlDireccionSepolia(c.direccion)}>{hashCorto(c.direccion, 5)} ↗</LinkBaseScan>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
                <span title="mARGt">{formatDecimal(c.argt, 2)} mARGt</span>
                <span className={sinGas ? "text-estado-rechazado-tx" : "text-suave"} title="ETH para el gas">{formatDecimal(c.eth, 4)} ETH{sinGas ? " · sin gas" : ""}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${c.kyc ? "bg-estado-pagado-bg text-estado-pagado-tx" : "bg-estado-pendiente-bg text-estado-pendiente-tx"}`}>{c.kyc ? "KYC aprobado" : "Sin KYC"}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {r.datos.some((c) => ROLES_QUE_PAGAN_GAS.includes(c.id) && Number(c.eth) < GAS_MINIMO) && (
        <p className="text-xs text-estado-rechazado-tx">Una wallet sin ETH no puede firmar: cargala desde un faucet de Base Sepolia antes de la demo.</p>
      )}
      <Boton onClick={r.recargar} className="px-3 py-1.5 text-xs">Actualizar</Boton>
    </div>
  );
}

function RescatesDemo() {
  const fondo = useApi<ResumenFondo>("/api/fondo");
  const rescates = useApi<RescateVista[]>("/api/rescates");
  const [cambiandoModo, setCambiandoModo] = useState(false);
  const [liquidando, setLiquidando] = useState(false);
  const [error, setError] = useState<ErrorUi | undefined>();
  const [resultado, setResultado] = useState<ResultadoRescates | null>(null);

  async function cambiarModo(activo: boolean) {
    setError(undefined);
    setCambiandoModo(true);
    try {
      await api.post("/api/demo/modo", { activo });
      fondo.recargar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCambiandoModo(false);
    }
  }

  async function liquidar() {
    setError(undefined);
    setResultado(null);
    setLiquidando(true);
    try {
      setResultado(leerResultadoRescates(await api.post<unknown>("/api/demo/rescates/liquidar")));
      rescates.recargar();
      fondo.recargar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setLiquidando(false);
    }
  }

  const modoActivo = fondo.estado === "listo" && fondo.datos.modoDemo;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-linea bg-panel-2 p-3">
        <div>
          <p id="modo-demo-titulo" className="text-sm font-medium">Adelantar plazos de rescate (solo demo)</p>
          <p id="modo-demo-ayuda" className="mt-1 text-xs text-suave">Normalmente un rescate se liquida a las 24 horas hábiles. Con esto prendido, el gestor puede liquidar todos los pendientes ya. En producción no existe.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={modoActivo}
          aria-labelledby="modo-demo-titulo"
          aria-describedby="modo-demo-ayuda"
          disabled={cambiandoModo || fondo.estado !== "listo"}
          onClick={() => cambiarModo(!modoActivo)}
          className={`relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-50 ${modoActivo ? "border-texto bg-primario" : "border-linea-fuerte bg-linea"}`}
        >
          <span aria-hidden className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${modoActivo ? "left-6 bg-sobre-primario" : "left-0.5 bg-suave"}`} />
          <span className="sr-only">{modoActivo ? "Activado" : "Desactivado"}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Boton variante="primario" onClick={liquidar} disabled={liquidando}>{liquidando ? "Liquidando…" : "El gestor liquida los rescates"}</Boton>
        {fondo.estado === "listo" && <span className="text-xs text-suave">{fondo.datos.rescatesPendientes} pendientes</span>}
      </div>
      {error && <ErrorApiCaja error={error} />}
      {resultado && (
        <div role="status" className="space-y-2 rounded-2xl border border-linea bg-panel-2 p-3 text-sm">
          <p className="font-medium">{resultado.liquidados.length === 0 ? "No había rescates para liquidar." : `El gestor liquidó ${resultado.liquidados.length} rescate${resultado.liquidados.length === 1 ? "" : "s"}.`}</p>
          {resultado.liquidados.length > 0 && (
            <ul className="space-y-1">
              {resultado.liquidados.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-linea pt-1">
                  <span>Rescate {d.id}{d.cuotapartes ? ` · ${formatDecimal(d.cuotapartes, 6)} cuotapartes` : ""}</span>
                  <span className="tabular-nums">{d.monto ? formatPesos(d.monto) : ""}</span>
                  {d.tx && <LinkBaseScan href={urlTx(d.tx)}>{hashCorto(d.tx)} ↗</LinkBaseScan>}
                </li>
              ))}
            </ul>
          )}
          {resultado.salteados.length > 0 && (
            <ul className="space-y-1 text-suave">
              {resultado.salteados.map((d) => <li key={d.id}>Rescate {d.id} no se liquidó{d.motivo ? `: ${d.motivo}` : "."}</li>)}
            </ul>
          )}
          {resultado.explicacion && <p className="text-suave">{resultado.explicacion}</p>}
        </div>
      )}

      {rescates.estado === "cargando" && <Cargando lineas={2} />}
      {rescates.estado === "error" && <ErrorCaja mensaje={rescates.mensaje} onReintentar={rescates.recargar} />}
      {rescates.estado === "listo" && <TablaRescates rescates={rescates.datos} vacio="No hay rescates todavía. Pedí uno desde la sección Invertir." />}
    </div>
  );
}

export function ControlDemo() {
  const cheques = useApi<ChequeVista[]>("/api/cheques");
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<Record<string, Aviso>>({});

  async function liquidar(id: string, resultado: ResultadoLiquidacion) {
    setEnCurso(id);
    try {
      const r = await api.post<{ tx: string }>("/api/demo/liquidar", { chequeId: id, resultado });
      setAvisos((a) => ({ ...a, [id]: { tipo: "ok", resultado, tx: r.tx } }));
      cheques.recargar();
    } catch (e) {
      setAvisos((a) => ({ ...a, [id]: { tipo: "error", error: mensajeDeError(e) } }));
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 md:mx-0">
      <div>
        <h1 className="text-2xl font-semibold">Control de la demo</h1>
        <p className="mt-1 text-sm text-suave">
          Solo para el equipo. Los cheques reales vencen en 30 a 90 días; acá “adelantamos el tiempo” y el oráculo marca cada cheque como pagado o rechazado.
        </p>
      </div>

      <Tarjeta titulo="Cheques y pagarés fondeados">
        {cheques.estado === "cargando" && <Cargando lineas={3} />}
        {cheques.estado === "error" && <ErrorCaja mensaje={cheques.mensaje} onReintentar={cheques.recargar} />}
        {cheques.estado === "listo" && (() => {
          const liquidables = chequesLiquidables(cheques.datos);
          const r = resumenPorEstado(cheques.datos);
          return (
            <div className="space-y-3">
              <p className="text-xs text-suave">
                {r.Pending} pendientes · {r.Funded} fondeados · {r.Paid} pagados · {r.Rejected} rechazados
              </p>
              {liquidables.length === 0 ? (
                <p className="text-sm text-suave">No hay cheques fondeados para liquidar. Cargá y fondeá uno desde la sección Pyme.</p>
              ) : (
                <ul className="space-y-3">
                  {liquidables.map((c) => (
                    <FilaCheque key={c.id} c={c} aviso={avisos[c.id]} enCurso={enCurso === c.id} onLiquidar={(res) => liquidar(c.id, res)} />
                  ))}
                </ul>
              )}
            </div>
          );
        })()}
      </Tarjeta>

      <Tarjeta titulo="Rescates">
        <RescatesDemo />
      </Tarjeta>

      <Tarjeta titulo="Wallets de demo">
        <CuentasDemo />
      </Tarjeta>
    </div>
  );
}
