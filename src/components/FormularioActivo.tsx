"use client";
import { useRef, useState } from "react";
import type { TipoActivo, TipoGarantia } from "@/shared/types";
import type { ErrorUi } from "@/lib/api-client";
import { NOMBRE_EMISOR, NOMBRE_GARANTIA, NOMBRE_TIPO } from "@/lib/cotizacion";
import {
  LIMITE_BALANCE_BYTES,
  MAX_DOCUMENTOS,
  TIPOS_GARANTIA_ELEGIBLES,
  hoyISO,
  validarArchivoBalance,
  validarFormulario,
  type ErroresFormulario,
  type ValoresFormulario,
} from "@/lib/pyme";
import { Boton, ErrorApiCaja } from "./ui";

const campo = "mt-1 w-full rounded-ui border border-linea-fuerte bg-fondo px-3 py-2.5 text-base text-texto placeholder:text-suave/60 focus:border-texto focus:outline-none";

function Campo(props: { id: string; etiqueta: string; ayuda?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={props.id} className="text-sm">{props.etiqueta}</label>
      {props.children}
      {props.error ? (
        <p id={`${props.id}-error`} className="mt-1 text-xs text-estado-rechazado-tx">{props.error}</p>
      ) : (
        props.ayuda && <p className="mt-1 text-xs text-suave">{props.ayuda}</p>
      )}
    </div>
  );
}

const TIPOS: TipoActivo[] = ["cheque", "pagare"];

/** Formulario de carga: cheque o pagaré, garantía opcional y balance opcional. */
export function FormularioActivo({ onCotizar, errorApi }: { onCotizar: (v: ValoresFormulario) => void; errorApi?: ErrorUi }) {
  const [tipo, setTipo] = useState<TipoActivo>("cheque");
  const [cuit, setCuit] = useState("");
  const [monto, setMonto] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const [conGarantia, setConGarantia] = useState(false);
  const [gTipo, setGTipo] = useState<TipoGarantia | "">("");
  const [gDesc, setGDesc] = useState("");
  const [gValor, setGValor] = useState("");
  const [docs, setDocs] = useState<string[]>([""]);
  const [balance, setBalance] = useState("");
  const [errorArchivo, setErrorArchivo] = useState<string | undefined>();
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const archivo = useRef<HTMLInputElement>(null);

  const quien = NOMBRE_EMISOR[tipo];
  const instrumento = tipo === "pagare" ? "pagaré" : "cheque";

  async function leerArchivo(f: File | undefined) {
    setErrorArchivo(undefined);
    if (!f) return;
    const problema = validarArchivoBalance(f.name, f.size);
    if (problema) {
      setErrorArchivo(problema);
      if (archivo.current) archivo.current.value = "";
      return;
    }
    try {
      setBalance(await f.text());
    } catch {
      setErrorArchivo("No pudimos leer el archivo. Probá pegando el texto.");
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const valores: ValoresFormulario = {
      cuit,
      monto,
      vencimiento,
      tipo,
      balance,
      garantia: conGarantia ? { tipo: gTipo === "" ? "ninguna" : gTipo, descripcion: gDesc, valorDeclarado: gValor, documentos: docs } : undefined,
    };
    const err = validarFormulario(valores, hoyISO());
    setErrores(err);
    if (Object.keys(err).length === 0) onCotizar(valores);
  }

  const desc = (id: string, e?: string) => (e ? `${id}-error` : undefined);

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <fieldset>
        <legend className="text-sm">¿Qué vendés?</legend>
        <div role="radiogroup" aria-label="Tipo de instrumento" className="mt-2 flex gap-2">
          {TIPOS.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              onClick={() => setTipo(t)}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${tipo === t ? "border-texto bg-panel-2 text-texto" : "border-linea-fuerte text-suave hover:text-texto"}`}
            >
              {NOMBRE_TIPO[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <Campo id="cuit" etiqueta={`CUIT del ${quien}`} ayuda={`Quien emitió el ${instrumento} y lo va a pagar. Es a quien puntuamos.`} error={errores.cuit}>
        <input id="cuit" inputMode="numeric" autoComplete="off" placeholder="30-00000000-0" value={cuit} onChange={(e) => setCuit(e.target.value)} aria-invalid={!!errores.cuit} aria-describedby={desc("cuit", errores.cuit)} className={campo} />
      </Campo>
      <Campo id="monto" etiqueta={`Monto del ${instrumento} (en pesos)`} error={errores.monto}>
        <input id="monto" inputMode="numeric" autoComplete="off" placeholder="10.000.000" value={monto} onChange={(e) => setMonto(e.target.value)} aria-invalid={!!errores.monto} aria-describedby={desc("monto", errores.monto)} className={campo} />
      </Campo>
      <Campo id="vencimiento" etiqueta="Vencimiento" error={errores.vencimiento}>
        <input id="vencimiento" type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} aria-invalid={!!errores.vencimiento} aria-describedby={desc("vencimiento", errores.vencimiento)} className={campo} />
      </Campo>

      <fieldset className="rounded-2xl border border-linea p-4">
        <legend className="px-1 text-sm font-medium">Garantía (opcional)</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={conGarantia} onChange={(e) => setConGarantia(e.target.checked)} className="h-4 w-4 accent-[var(--acento)]" />
          Ofrezco una garantía
        </label>
        {conGarantia && (
          <div className="mt-4 space-y-4">
            <Campo id="g-tipo" etiqueta="Tipo de garantía" error={errores.garantiaTipo}>
              <select id="g-tipo" value={gTipo} onChange={(e) => setGTipo(e.target.value as TipoGarantia | "")} aria-invalid={!!errores.garantiaTipo} aria-describedby={desc("g-tipo", errores.garantiaTipo)} className={campo}>
                <option value="">Elegí una opción</option>
                {TIPOS_GARANTIA_ELEGIBLES.map((t) => <option key={t} value={t}>{NOMBRE_GARANTIA[t]}</option>)}
              </select>
            </Campo>
            <Campo id="g-desc" etiqueta="Descripción" ayuda="Por ejemplo: camioneta, marca, modelo, año y dominio." error={errores.garantiaDescripcion}>
              <textarea id="g-desc" rows={2} value={gDesc} onChange={(e) => setGDesc(e.target.value)} aria-invalid={!!errores.garantiaDescripcion} aria-describedby={desc("g-desc", errores.garantiaDescripcion)} className={campo} />
            </Campo>
            <Campo id="g-valor" etiqueta="Valor declarado (en pesos)" ayuda="Lo declarás vos; el fondo no lo verifica en este paso." error={errores.garantiaValor}>
              <input id="g-valor" inputMode="numeric" autoComplete="off" placeholder="12.000.000" value={gValor} onChange={(e) => setGValor(e.target.value)} aria-invalid={!!errores.garantiaValor} aria-describedby={desc("g-valor", errores.garantiaValor)} className={campo} />
            </Campo>
            <div>
              <p className="text-sm">Documentos que adjuntás</p>
              <ul className="mt-1 space-y-2">
                {docs.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <input
                      aria-label={`Documento ${i + 1}`}
                      value={d}
                      maxLength={120}
                      placeholder="Título de dominio, tasación, póliza…"
                      onChange={(e) => setDocs((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                      className={`${campo} mt-0`}
                    />
                    <Boton aria-label={`Quitar documento ${i + 1}`} onClick={() => setDocs((l) => (l.length === 1 ? [""] : l.filter((_, j) => j !== i)))} className="px-3 py-2">Quitar</Boton>
                  </li>
                ))}
              </ul>
              {docs.length < MAX_DOCUMENTOS && <Boton onClick={() => setDocs((l) => [...l, ""])} className="mt-2 px-3 py-1.5 text-xs">Agregar documento</Boton>}
              <p className="mt-1 text-xs text-suave">La prenda legal se firma después; acá solo listamos qué tenés.</p>
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="rounded-2xl border border-linea p-4">
        <legend className="px-1 text-sm font-medium">Balance del emisor (opcional)</legend>
        <p className="text-xs text-suave">Si el balance no es público, pegalo o subilo: el agente lo lee para analizar al emisor. Sin balance, usa solo los datos del BCRA y lo aclara.</p>
        <Campo id="balance" etiqueta="Pegá el texto del balance" error={errores.balance}>
          <textarea id="balance" rows={4} value={balance} onChange={(e) => setBalance(e.target.value)} aria-invalid={!!errores.balance} aria-describedby={desc("balance", errores.balance)} className={`${campo} font-mono text-sm`} />
        </Campo>
        <div className="mt-3">
          <label htmlFor="balance-archivo" className="text-sm">O subí un archivo .txt o .csv</label>
          <input id="balance-archivo" ref={archivo} type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(e) => leerArchivo(e.target.files?.[0])} className="mt-1 block w-full text-sm text-suave file:mr-3 file:rounded-full file:border file:border-linea-fuerte file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-texto" />
          {errorArchivo ? <p role="alert" className="mt-1 text-xs text-estado-rechazado-tx">{errorArchivo}</p> : <p className="mt-1 text-xs text-suave">Máximo {LIMITE_BALANCE_BYTES / 1000} KB. Se lee en tu navegador.</p>}
        </div>
      </fieldset>

      {errorApi && <ErrorApiCaja error={errorApi} />}
      <Boton type="submit" variante="primario" className="w-full sm:w-auto">{`Cotizar ${instrumento}`}</Boton>
    </form>
  );
}
