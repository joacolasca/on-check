// Cliente tipado de la API (enchufe 3 de docs/INTERFACES.md). La UI habla solo con esto.
import type { ApiError } from "@/shared/types";

export class ApiClientError extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    public readonly status: number,
  ) {
    super(mensaje);
    this.name = "ApiClientError";
  }
}

function esApiError(x: unknown): x is ApiError {
  if (typeof x !== "object" || x === null || !("error" in x)) return false;
  const e = (x as { error: unknown }).error;
  return typeof e === "object" && e !== null && "codigo" in e && "mensaje" in e;
}

async function pedir<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiClientError("RED", "No pudimos conectar con el servidor. Revisá tu conexión y reintentá.", 0);
  }
  let cuerpo: unknown;
  try {
    cuerpo = await res.json();
  } catch {
    throw new ApiClientError("RESPUESTA_INVALIDA", "El servidor respondió algo que no entendimos.", res.status);
  }
  if (esApiError(cuerpo)) throw new ApiClientError(cuerpo.error.codigo, cuerpo.error.mensaje, res.status);
  if (!res.ok) throw new ApiClientError("ERROR_HTTP", `El servidor respondió con error ${res.status}.`, res.status);
  return cuerpo as T;
}

export const api = {
  get: <T>(path: string) => pedir<T>(path, { cache: "no-store" }),
  post: <T>(path: string, body?: unknown) =>
    pedir<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};

export interface ErrorUi {
  codigo: string;
  mensaje: string;
}

/** Las acciones que firman piden la clave de la demo (cookie de sesión que se obtiene en /api/demo/acceso). */
export const esErrorDeAcceso = (codigo: string): boolean => codigo === "NO_AUTORIZADO";

export function mensajeDeError(e: unknown): ErrorUi {
  if (e instanceof ApiClientError) return { codigo: e.codigo, mensaje: e.message };
  return { codigo: "DESCONOCIDO", mensaje: "Algo salió mal. Probá de nuevo." };
}
