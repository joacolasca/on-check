"use client";
// Plan automático del inversor: el agente compra cuotapartes cada período (DCA) dentro del precio máximo y pide el rescate
// cuando la cuotaparte llega al precio de venta. Cada movimiento es una transacción real en testnet y se explica.
import { useRef, useState } from "react";
import type { CuentaDemo, PosicionInversor, ResumenFondo } from "@/shared/types";
import { api, mensajeDeError, type ErrorUi } from "@/lib/api-client";
import { formatDecimal, formatPesos, hashCorto, urlTx } from "@/lib/format";
import { REGLAS_POR_DEFECTO, decidirPeriodo, etiquetaPeriodo, validarReglas, MAX_PERIODOS, type Decision, type Frecuencia, type ReglasPlan } from "@/lib/plan";
import { Boton, ErrorApiCaja, LinkBaseScan, Metrica, Tarjeta } from "./ui";

interface Paso {
  etiqueta: string;
  valor: string;
  decision: Decision;
  estado: "ejecutando" | "listo" | "error";
  tx?: string;
  error?: string;
}

const campo = "w-full rounded-ui border border-linea bg-panel-2 px-3 py-2 text-sm tabular-nums";
const ICONO: Record<Decision["accion"], string> = { comprar: "Compra", vender: "Venta", esperar: "Espera" };

export function PlanAutomatico() {
  const [cuenta, setCuenta] = useState<CuentaDemo>("inversor1");
  const [reglas, setReglas] = useState<ReglasPlan>(REGLAS_POR_DEFECTO);
  const [vende, setVende] = useState(false);
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [corriendo, setCorriendo] = useState(false);
  const [error, setError] = useState<ErrorUi | null>(null);
  const [final, setFinal] = useState<PosicionInversor | null>(null);
  const pausa = useRef(false);

  const efectivas: ReglasPlan = { ...reglas, precioVenta: vende ? reglas.precioVenta ?? "" : null };
  const invalido = validarReglas(efectivas);
  const set = <K extends keyof ReglasPlan>(k: K, v: ReglasPlan[K]) => setReglas((r) => ({ ...r, [k]: v }));
  const actualizar = (i: number, p: Partial<Paso>) => setPasos((ps) => ps.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function activar() {
    if (invalido) return;
    pausa.current = false;
    setCorriendo(true);
    setError(null);
    setFinal(null);
    setPasos([]);
    try {
      for (let n = 1; n <= efectivas.periodos && !pausa.current; n++) {
        const fondo = await api.get<ResumenFondo>("/api/fondo");
        const pos = await api.get<PosicionInversor>(`/api/demo/posicion?cuenta=${cuenta}`);
        const decision = decidirPeriodo(efectivas, fondo.valorCuotaparte, pos.cuotapartes);
        const i = n - 1;
        setPasos((ps) => [...ps, { etiqueta: etiquetaPeriodo(efectivas.frecuencia, n), valor: fondo.valorCuotaparte, decision, estado: "ejecutando" }]);
        try {
          if (decision.accion === "comprar") {
            const r = await api.post<{ tx: string }>("/api/demo/invertir", { cuenta, cuotapartes: decision.cuotapartes });
            actualizar(i, { estado: "listo", tx: r.tx });
          } else if (decision.accion === "vender") {
            const r = await api.post<{ tx: string }>("/api/demo/rescates", { cuenta, cuotapartes: decision.cuotapartes });
            actualizar(i, { estado: "listo", tx: r.tx });
          } else {
            actualizar(i, { estado: "listo" });
          }
        } catch (e) {
          const m = mensajeDeError(e);
          actualizar(i, { estado: "error", error: m.mensaje });
          if (m.codigo === "NO_AUTORIZADO") {
            setError(m);
            break;
          }
        }
      }
      setFinal(await api.get<PosicionInversor>(`/api/demo/posicion?cuenta=${cuenta}`));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCorriendo(false);
    }
  }

  const compras = pasos.filter((p) => p.decision.accion === "comprar" && p.estado === "listo").length;
  const ventas = pasos.filter((p) => p.decision.accion === "vender" && p.estado === "listo").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Plan automático</h1>
        <p className="mt-1 text-sm text-suave">Elegís cuánto, cada cuánto y a qué precio. El agente compra y vende cuotapartes del fondo por vos.</p>
      </div>

      <Tarjeta titulo="Tus reglas">
        <fieldset disabled={corriendo} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Cuenta</span>
            <select className={campo} value={cuenta} onChange={(e) => setCuenta(e.target.value as CuentaDemo)}>
              <option value="inversor1">Inversor 1</option>
              <option value="inversor2">Inversor 2</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Frecuencia</span>
            <select className={campo} value={reglas.frecuencia} onChange={(e) => set("frecuencia", e.target.value as Frecuencia)}>
              <option value="semanal">Semanal</option>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Cuotapartes por compra</span>
            <input className={campo} inputMode="numeric" value={reglas.cuotapartesPorCompra} onChange={(e) => set("cuotapartesPorCompra", e.target.value.trim())} />
            <span className="block text-xs text-suave">Mínimo 1.000.</span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Comprar solo si la cuotaparte vale hasta ($)</span>
            <input className={campo} inputMode="decimal" value={reglas.precioMaxCompra} onChange={(e) => set("precioMaxCompra", e.target.value.trim().replace(",", "."))} />
          </label>
          <div className="space-y-2 text-sm sm:col-span-2">
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={vende} onChange={(e) => setVende(e.target.checked)} />
              Vender cuando la cuotaparte llegue a un precio
            </label>
            {vende && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-suave">Precio de venta ($)</span>
                  <input className={campo} inputMode="decimal" value={reglas.precioVenta ?? ""} onChange={(e) => set("precioVenta", e.target.value.trim().replace(",", "."))} />
                </label>
                <label className="space-y-1">
                  <span className="text-suave">Cuotapartes a vender</span>
                  <input className={campo} inputMode="numeric" value={reglas.cuotapartesVenta} onChange={(e) => set("cuotapartesVenta", e.target.value.trim())} />
                </label>
              </div>
            )}
          </div>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Períodos a correr ahora</span>
            <input className={campo} type="number" min={1} max={MAX_PERIODOS} value={reglas.periodos} onChange={(e) => set("periodos", Number(e.target.value))} />
            <span className="block text-xs text-suave">En la demo el calendario se acelera: cada período corre al instante.</span>
          </label>
        </fieldset>
        {invalido && <p className="mt-3 text-sm text-estado-rechazado-tx">{invalido}</p>}
        <div className="mt-4 flex gap-2">
          {!corriendo ? (
            <Boton variante="primario" onClick={activar} disabled={!!invalido}>Activar plan</Boton>
          ) : (
            <Boton onClick={() => (pausa.current = true)}>Pausar</Boton>
          )}
        </div>
      </Tarjeta>

      {error && <ErrorApiCaja error={error} />}

      {pasos.length > 0 && (
        <Tarjeta titulo="Movimientos del agente">
          <ol className="divide-y divide-linea">
            {pasos.map((p) => (
              <li key={p.etiqueta} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {p.etiqueta} · {ICONO[p.decision.accion]}
                    <span className="ml-2 font-normal text-suave">cuotaparte {formatPesos(p.valor)}</span>
                  </p>
                  <p className="text-suave">{p.estado === "error" ? p.error : p.decision.explicacion}</p>
                </div>
                <span className="shrink-0 text-xs">
                  {p.estado === "ejecutando" && <span className="text-suave">Firmando…</span>}
                  {p.tx && <LinkBaseScan href={urlTx(p.tx)}>{hashCorto(p.tx, 5)} ↗</LinkBaseScan>}
                  {p.estado === "error" && <span className="text-estado-rechazado-tx">No se pudo</span>}
                </span>
              </li>
            ))}
          </ol>
        </Tarjeta>
      )}

      {final && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metrica etiqueta="Compras" valor={compras} nota={`${pasos.length} períodos`} />
          <Metrica etiqueta="Ventas" valor={ventas} nota="Rescates a 24 h hábiles" />
          <Metrica etiqueta="Tus cuotapartes" valor={formatDecimal(final.cuotapartes, 2)} nota="Después del plan" />
          <Metrica etiqueta="Valor de tu posición" valor={formatPesos(final.valor)} nota="Al valor de hoy" />
        </div>
      )}
    </div>
  );
}
