"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { CuentaDemo, CuentaDemoEstado, PosicionInversor, ResumenFondo } from "@/shared/types";
import { api, mensajeDeError, type ErrorUi } from "@/lib/api-client";
import { formatDecimal, formatFechaLiquidacion, formatPesos, hashCorto, urlTx } from "@/lib/format";
import {
  CUENTAS,
  claveStorage,
  kycAprobado,
  leerPosicion,
  costoEstimado,
  MIN_CUOTAPARTES,
  validarCuotapartesSuscripcion,
  type PosicionCuenta,
} from "@/lib/invertir";
import { liquidableDesdeEstimado, validarCuotapartes } from "@/lib/rescates";
import { useApi } from "@/lib/use-api";
import { TablaRescates } from "./TablaRescates";
import { Boton, Cargando, ErrorApiCaja, ErrorCaja, LinkBaseScan, Metrica, Tarjeta } from "./ui";

const EVENTO = "fondo-cheques:posicion";

function suscribir(cb: () => void) {
  window.addEventListener(EVENTO, cb);
  return () => window.removeEventListener(EVENTO, cb);
}

function leerCrudo(): string {
  try {
    return JSON.stringify(CUENTAS.map((c) => sessionStorage.getItem(claveStorage(c.id))));
  } catch {
    return "[]"; // sin storage la demo sigue andando: solo se pierde la memoria entre pantallas
  }
}

function guardar(cuenta: CuentaDemo, p: PosicionCuenta) {
  try {
    sessionStorage.setItem(claveStorage(cuenta), JSON.stringify(p));
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    // ver leerCrudo
  }
}

/** Posiciones de las cuentas de demo, recordadas en sessionStorage (la API no expone saldos todavía). */
function usePosiciones(): Record<CuentaDemo, PosicionCuenta> {
  const crudo = useSyncExternalStore(suscribir, leerCrudo, () => "[]");
  return useMemo(() => {
    const lista = JSON.parse(crudo) as (string | null)[];
    return {
      inversor1: leerPosicion(lista[0] ?? null),
      inversor2: leerPosicion(lista[1] ?? null),
    };
  }, [crudo]);
}

function PasoKyc({ aprobado, enCurso, onAprobar }: { aprobado: boolean; enCurso: boolean; onAprobar: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm">
          Verificación de identidad (KYC){" "}
          <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${aprobado ? "bg-estado-pagado-bg text-estado-pagado-tx" : "bg-estado-pendiente-bg text-estado-pendiente-tx"}`}>
            {aprobado ? "Aprobada" : "Pendiente"}
          </span>
        </p>
        <p className="mt-1 text-xs text-suave">El contrato solo deja entrar y salir a direcciones aprobadas.</p>
      </div>
      {!aprobado && (
        <Boton variante="primario" onClick={onAprobar} disabled={enCurso} className="w-full sm:w-auto">
          {enCurso ? "Aprobando…" : "Aprobar KYC"}
        </Boton>
      )}
    </div>
  );
}

const entradaCampo = "mt-1 w-full rounded-ui border border-linea-fuerte bg-fondo px-3 py-2.5 text-base text-texto placeholder:text-suave/60 focus:border-texto focus:outline-none";

function PasoInvertir({ kyc, valorCuotaparte, minimo, onSuscribir }: { kyc: boolean; valorCuotaparte: string; minimo: string; onSuscribir: (cuotapartes: string) => Promise<ErrorUi | null> }) {
  const [entrada, setEntrada] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [enCurso, setEnCurso] = useState(false);
  const [errorApi, setErrorApi] = useState<ErrorUi | undefined>();

  const valor = valorCuotaparte === "0" ? "1000" : valorCuotaparte;
  const pedido = validarCuotapartesSuscripcion(entrada, valor, minimo);
  // Aun por debajo del mínimo o con fracciones, si es un entero se muestra el costo estimado.
  const enteras = entrada.replace(/\./g, "");
  const costo = /^\d+$/.test(enteras) && enteras !== "0" ? costoEstimado(enteras.replace(/^0+(?=\d)/, ""), valor) : undefined;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!kyc) {
      setError("Primero aprobá el KYC de esta cuenta.");
      return;
    }
    if ("error" in pedido) {
      setError(pedido.error);
      return;
    }
    setError(undefined);
    setEnCurso(true);
    const fallo = await onSuscribir(pedido.cuotapartes);
    setEnCurso(false);
    setErrorApi(fallo ?? undefined);
    if (!fallo) setEntrada("");
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-3">
      <div>
        <label htmlFor="cuotapartes-suscripcion" className="text-sm">Cuotapartes a suscribir</label>
        <input
          id="cuotapartes-suscripcion"
          inputMode="numeric"
          autoComplete="off"
          placeholder={formatDecimal(minimo)}
          value={entrada}
          onChange={(e) => { setEntrada(e.target.value); setError(undefined); }}
          aria-invalid={!!error}
          aria-describedby={error ? "cuotapartes-suscripcion-error" : "simulador"}
          className={entradaCampo}
        />
        {error && <p id="cuotapartes-suscripcion-error" className="mt-1 text-xs text-estado-rechazado-tx">{error}</p>}
        <p id="simulador" aria-live="polite" className="mt-2 rounded-ui bg-panel-2 px-3 py-2 text-sm">
          {costo ? (
            <><strong className="tabular-nums">{formatDecimal(enteras.replace(/^0+(?=\d)/, ""))}</strong> cuotapartes ≈ <strong className="tabular-nums">{formatPesos(costo)}</strong>, a {formatPesos(valor)} cada una.</>
          ) : (
            <span className="text-suave">Escribí cuántas cuotapartes querés y te decimos cuánto cuestan al valor de hoy.</span>
          )}
        </p>
        <p className="mt-1 text-xs text-suave">
          Suscripción mínima: {formatDecimal(minimo)} cuotapartes, de a 1 (≈ {formatPesos(costoEstimado(minimo, valor))} al valor de hoy). En la demo usamos un ARGt simulado: se emite al instante y entra al fondo.{" "}
          <button type="button" className="text-enlace underline-offset-2 hover:underline" onClick={() => { setEntrada(minimo); setError(undefined); }}>
            Mínimo ({formatDecimal(minimo)} cuotapartes)
          </button>
        </p>
      </div>
      {errorApi && <ErrorApiCaja error={errorApi} />}
      <Boton type="submit" variante="primario" disabled={enCurso} className="w-full sm:w-auto">{enCurso ? "Suscribiendo…" : "Suscribir"}</Boton>
    </form>
  );
}

function Posicion({ pos, depositos }: { pos: PosicionInversor; depositos: PosicionCuenta["depositos"] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Metrica etiqueta="Cuotapartes" valor={formatDecimal(pos.cuotapartes, 6)} />
        <Metrica etiqueta="Valor de tu posición" valor={formatPesos(pos.valor)} nota="Al valor de cuotaparte de hoy; puede subir o bajar" />
      </div>
      {depositos.length > 0 && (
        <ul className="space-y-1 text-sm">
          {depositos.map((d) => (
            <li key={d.tx + d.monto} className="flex flex-wrap items-center justify-between gap-2 border-t border-linea py-2">
              <span className="font-mono tabular-nums">{formatPesos(d.monto)}</span>
              <span className="text-xs text-suave">{formatDecimal(d.shares, 6)} cuotapartes</span>
              <LinkBaseScan href={urlTx(d.tx)}>{hashCorto(d.tx)} ↗</LinkBaseScan>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PasoRescate({ disponibles, politica, onRescatar }: { disponibles: string; politica: { rescateHorasHabiles: number; rescateCorteHora: number }; onRescatar: (cuotapartes: string) => Promise<ErrorUi | null> }) {
  const [entrada, setEntrada] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [enCurso, setEnCurso] = useState(false);
  const [errorApi, setErrorApi] = useState<ErrorUi | undefined>();
  const [ok, setOk] = useState(false);
  const estimada = liquidableDesdeEstimado(new Date(), politica.rescateCorteHora);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setOk(false);
    const v = validarCuotapartes(entrada, disponibles);
    if ("error" in v) {
      setError(v.error);
      return;
    }
    setError(undefined);
    setEnCurso(true);
    const fallo = await onRescatar(v.cuotapartes);
    setEnCurso(false);
    setErrorApi(fallo ?? undefined);
    if (!fallo) {
      setEntrada("");
      setOk(true);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-3">
      <p className="rounded-ui border border-linea bg-panel-2 px-3 py-2 text-sm">
        El rescate se liquida a <strong>{politica.rescateHorasHabiles} horas hábiles</strong>. Si lo pedís hasta las {politica.rescateCorteHora} hs (hora de Buenos Aires) corre desde hoy; si es después, desde el siguiente día hábil.
        Se paga al valor de la cuotaparte del día de la liquidación.
      </p>
      <div>
        <label htmlFor="cuotapartes-rescate" className="text-sm">Cuotapartes a rescatar</label>
        <input
          id="cuotapartes-rescate"
          inputMode="decimal"
          autoComplete="off"
          placeholder="1.000"
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? "cuotapartes-rescate-error" : undefined}
          className={entradaCampo}
        />
        {error && <p id="cuotapartes-rescate-error" className="mt-1 text-xs text-estado-rechazado-tx">{error}</p>}
        <p className="mt-1 text-xs text-suave">
          Tenés {formatDecimal(disponibles, 6)} cuotapartes.{" "}
          <button type="button" className="text-enlace underline-offset-2 hover:underline" onClick={() => setEntrada(formatDecimal(disponibles, 6))}>Rescatar todas</button>
        </p>
        <p className="mt-1 text-xs text-suave">Si lo pedís ahora, se liquidaría desde el {formatFechaLiquidacion(estimada.toISOString())} (estimación: la fecha exacta la fija el contrato; no se consideran feriados).</p>
      </div>
      {errorApi && <ErrorApiCaja error={errorApi} />}
      {ok && <p role="status" className="text-sm text-estado-pagado-tx">Pedido registrado. Lo ves abajo, con su fecha de liquidación.</p>}
      <Boton type="submit" disabled={enCurso} className="w-full sm:w-auto">{enCurso ? "Solicitando…" : "Solicitar rescate"}</Boton>
    </form>
  );
}

export function Inversor() {
  const [cuentaId, setCuentaId] = useState<CuentaDemo>("inversor1");
  const posiciones = usePosiciones();
  const [kycEnCurso, setKycEnCurso] = useState(false);
  const [errorAccion, setErrorAccion] = useState<ErrorUi | undefined>();
  const fondo = useApi<ResumenFondo>("/api/fondo");
  const posApi = useApi<PosicionInversor>(`/api/demo/posicion?cuenta=${cuentaId}`);
  const cuentasCadena = useApi<CuentaDemoEstado[]>("/api/demo/cuentas");

  const cuenta = CUENTAS.find((c) => c.id === cuentaId) ?? CUENTAS[0];
  const pos = posiciones[cuentaId];
  const kyc = kycAprobado(cuentaId, pos.kyc, cuentasCadena.estado === "listo" ? cuentasCadena.datos : undefined);
  const valorCuotaparte = fondo.estado === "listo" ? fondo.datos.valorCuotaparte : "1000";
  const minimo = fondo.estado === "listo" ? fondo.datos.politica.minCuotapartes : MIN_CUOTAPARTES;

  async function aprobarKyc() {
    setErrorAccion(undefined);
    setKycEnCurso(true);
    try {
      await api.post<{ tx: string }>("/api/demo/kyc", { cuenta: cuentaId });
      guardar(cuentaId, { ...pos, kyc: true });
    } catch (e) {
      setErrorAccion(mensajeDeError(e));
    } finally {
      setKycEnCurso(false);
    }
  }

  async function suscribirCuotapartes(cuotapartes: string): Promise<ErrorUi | null> {
    try {
      const r = await api.post<{ tx: string; shares: string; monto: string }>("/api/demo/invertir", { cuenta: cuentaId, cuotapartes });
      guardar(cuentaId, { ...pos, depositos: [...pos.depositos, { monto: r.monto, shares: r.shares, tx: r.tx }] });
      fondo.recargar();
      posApi.recargar();
      return null;
    } catch (e) {
      return mensajeDeError(e);
    }
  }

  async function rescatar(cuotapartes: string): Promise<ErrorUi | null> {
    try {
      await api.post("/api/demo/rescates", { cuenta: cuentaId, cuotapartes });
      fondo.recargar();
      posApi.recargar();
      return null;
    } catch (e) {
      return mensajeDeError(e);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 md:mx-0">
      <div>
        <h1 className="text-2xl font-semibold">Invertí en el fondo</h1>
        <p className="mt-1 text-sm text-suave">
          Pagás y cobrás en ARGt; el instrumento es la cuotaparte. Se suscribe a mínimo {formatDecimal(minimo)} cuotapartes y de a 1. La cuotaparte arranca en {formatPesos("1000")} y su valor puede subir o bajar según cómo se paguen los cheques y pagarés.
        </p>
      </div>

      <Tarjeta titulo="1. Elegí una cuenta de demo">
        <div role="radiogroup" aria-label="Cuenta de demo" className="flex flex-wrap gap-2">
          {CUENTAS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === cuentaId}
              onClick={() => { setCuentaId(c.id); setErrorAccion(undefined); }}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${c.id === cuentaId ? "border-texto bg-panel-2 text-texto" : "border-linea-fuerte text-suave hover:text-texto"}`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta titulo="2. Aprobá el KYC">
        <PasoKyc aprobado={kyc} enCurso={kycEnCurso} onAprobar={aprobarKyc} />
        {errorAccion && <div className="mt-3"><ErrorApiCaja error={errorAccion} /></div>}
      </Tarjeta>

      <Tarjeta titulo="3. Suscribí cuotapartes">
        <PasoInvertir key={cuentaId} kyc={kyc} valorCuotaparte={valorCuotaparte} minimo={minimo} onSuscribir={suscribirCuotapartes} />
      </Tarjeta>

      <Tarjeta titulo={`Tu posición · ${cuenta.nombre}`}>
        {posApi.estado === "cargando" && <Cargando lineas={2} />}
        {posApi.estado === "error" && <ErrorCaja mensaje={posApi.mensaje} onReintentar={posApi.recargar} />}
        {posApi.estado === "listo" && <Posicion pos={posApi.datos} depositos={pos.depositos} />}
      </Tarjeta>

      <Tarjeta titulo="4. Rescatá cuotapartes">
        {posApi.estado === "listo" && fondo.estado === "listo" ? (
          <PasoRescate key={cuentaId} disponibles={posApi.datos.cuotapartes} politica={fondo.datos.politica} onRescatar={rescatar} />
        ) : (
          <Cargando lineas={2} />
        )}
      </Tarjeta>

      <Tarjeta titulo={`Rescates · ${cuenta.nombre}`}>
        {posApi.estado === "listo" ? <TablaRescates rescates={posApi.datos.rescates} vacio="Todavía no pediste rescates con esta cuenta." /> : <Cargando lineas={2} />}
      </Tarjeta>
    </div>
  );
}
