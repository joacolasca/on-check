"use client";
import { useMemo, useState } from "react";
import type { Composicion } from "@/shared/types";
import { DESGLOSES, armarPorciones, porcionesDe, type Desglose } from "@/lib/torta";
import { Chip } from "./ui";
import { Torta } from "./Torta";

/** Torta de la cartera con selector de desglose: por emisor, por industria, cheques vs. pagarés. */
export function TortasFondo({ composicion }: { composicion: Composicion }) {
  const [desglose, setDesglose] = useState<Desglose>("emisor");
  const porciones = useMemo(() => armarPorciones(porcionesDe(composicion, desglose)), [composicion, desglose]);
  const actual = DESGLOSES.find((d) => d.id === desglose) ?? DESGLOSES[0];
  return (
    <div>
      <div role="group" aria-label="Desglose de la cartera" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {DESGLOSES.map((d) => (
          <Chip key={d.id} activo={desglose === d.id} onClick={() => setDesglose(d.id)}>{d.etiqueta}</Chip>
        ))}
      </div>
      <Torta
        key={desglose}
        porciones={porciones}
        titulo={actual.titulo}
        etiquetaTotal="Invertido"
        vacio="Todavía no hay cheques ni pagarés comprados. Cuando el fondo compre el primero, lo ves acá."
      />
      <p className="mt-3 text-xs text-suave">Montos a costo de compra de los activos fondeados; los porcentajes son sobre lo invertido en cheques y pagarés (los topes de abajo se miden sobre el patrimonio). Se redondean a un decimal y suman 100 %.</p>
    </div>
  );
}
