"use client";
import { useCallback, useEffect, useState } from "react";
import { api, mensajeDeError } from "./api-client";

export type EstadoApi<T> =
  | { estado: "cargando" }
  | { estado: "error"; codigo: string; mensaje: string }
  | { estado: "listo"; datos: T };

/** GET con estados de carga y error, y `recargar` para reintentar o refrescar. */
export function useApi<T>(path: string): EstadoApi<T> & { recargar: () => void } {
  const [estado, setEstado] = useState<EstadoApi<T>>({ estado: "cargando" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    api
      .get<T>(path)
      .then((datos) => vigente && setEstado({ estado: "listo", datos }))
      .catch((e: unknown) => vigente && setEstado({ estado: "error", ...mensajeDeError(e) }));
    return () => {
      vigente = false;
    };
  }, [path, version]);

  const recargar = useCallback(() => {
    setEstado({ estado: "cargando" });
    setVersion((v) => v + 1);
  }, []);

  return { ...estado, recargar };
}
