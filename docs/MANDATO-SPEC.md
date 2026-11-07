# Mandato — el agente que invierte con las reglas del inversor

Pedido de Joaquín el 7-11-2026, a partir del análisis de tracks (PR #46). Se construye **sobre la v2** (`docs/V2-SPEC.md`). Los tipos TypeScript están en `src/shared/types.ts` (sección "Mandato"). Consigna: Belo #4 ("un agente que maneja tu plata con reglas que pone el usuario y explica cada movimiento") y a la vez el track AI (sin humano en el medio después del disparador).

## Idea en una frase
El inversor fija su **mandato** una vez (presupuesto, banda mínima, tope por emisor, plazo máximo, instrumentos, cobertura mínima de garantía) y toca **un solo botón**. El agente recorre la bandeja de activos, analiza cada uno con el gestor, el **servidor hace cumplir el mandato con reglas fijas (sin modelo)**, compra onchain lo que cumple y registra lo que el **contrato** rechaza. Si un activo rebota, el agente detecta la pérdida, deja de comprarle a ese emisor y replanifica. Termina con un informe y los links a BaseScan. El mandato se puede **pausar o revocar** en cualquier momento (modo opcional "aprobación humana por encima de $X").

## Honestidad
- No inventes una API ni un nombre de producto de Belo. Nada de vocabulario "rinde"/"rendimiento". "Objetivo", no promesa.
- El rebote es **simulado** por el oráculo de la demo y se rotula así en pantalla.
- Las pantallas dicen "agente" o "gestor", no "IA" (en el pitch hablado se puede decir).

## Reglas del mandato (servidor, `src/lib/mandato/politica.ts`, puras y con tests)
`evaluarMandato(activo, cotizacion, estado)` devuelve todas las razones, en este orden, y decide `comprar` solo si todas cumplen:
1. `revocado`: si el mandato está revocado, nada se compra.
2. `tipo`: el instrumento está en `mandato.tipos`.
3. `plazo`: `dias <= plazoMaxDias`.
4. `cotizacion`: la cotización del scoring fue aprobada (`aprobada`).
5. `banda`: banda de la cotización ≥ `bandaMinima` (A mejor que B mejor que C).
6. `gestor`: `decisionPM.decision !== 'rechazar'`.
7. `cobertura`: si hay garantía y `coberturaMinBps` no es null, `garantia.coberturaBps >= coberturaMinBps`; un pagaré sin garantía con `coberturaMinBps` definido **no cumple**.
8. `emisor_bloqueado`: el `libradorHash` no está en `emisoresBloqueados`.
9. `tope_emisor`: `(exposición del emisor + precioCompra) <= presupuesto * topeEmisorBps / 10000`.
10. `presupuesto`: `precioCompra <= disponible`.
11. `aprobacion`: si `aprobacionSobre` no es null y `nominal > aprobacionSobre`, el resultado es `pendiente_aprobacion` (no se compra hasta que un humano apruebe).
`resumen` en castellano explica la decisión con las cifras. El mandato del inversor es **independiente** de las reglas del fondo (10 % emisor, 25 % industria, 15 % liquidez, KYC): el contrato las hace cumplir aunque el mandato las permita (por eso el tope por emisor del mandato por defecto es del 15 %: el contrato dice que no a partir del 10 % del patrimonio y se ve la diferencia).

## Estado firmado
`EstadoMandato` viaja de ida y vuelta. El servidor lo firma con HMAC (mismo secreto y helpers que la firma de cotizaciones: `COTIZACION_SECRETO`) y rechaza con 400 `ESTADO_INVALIDO` un estado sin firma válida, así el presupuesto y los bloqueos no se pueden adulterar desde el navegador. `firma` queda fuera del contenido firmado, igual que en las cotizaciones.

## API (todas devuelven `{ error: { codigo, mensaje } }` ante errores)
- `GET /api/mandato/bandeja` → `{ activos: ActivoBandeja[], mandatoPorDefecto: Mandato }` (de `shared/fixtures/mandato-bandeja.json`).
- `POST /api/mandato/iniciar` `{ mandato }` → `{ estado }` firmado. Valida el mandato: presupuesto > 0 y ≤ $100.000.000, `topeEmisorBps` 100–10000, `plazoMaxDias` 1–90, `tipos` no vacío, `coberturaMinBps` null o 0–30000, `bandaMinima` A/B/C, `aprobacionSobre` null o monto positivo.
- `POST /api/agente/mandato` `{ estado, activo }` (NDJSON, `application/x-ndjson`, mismos eventos de pasos que `/api/agente/analizar` y un evento final `{ tipo: "evaluacion", evaluacion: EvaluacionMandato }`). Usa `analizarCheque` (gestor v2) sobre el activo y después `evaluarMandato`. No escribe en la cadena. `maxDuration = 60`.
- `POST /api/agente/mandato` con `soloAnalisis: true` (boolean opcional): el evento final es `{ tipo: "analisis", cotizacion }` (cotización firmada, sin evaluar el mandato; en JSON, `{ cotizacion, pasos }`). Así el navegador lanza varios análisis en paralelo con el estado inicial sin mostrar razones de presupuesto o tope que quedarían desactualizadas.
- `POST /api/mandato/evaluar` `{ estado, cotizacion, activo: { id, nombre } }` → `{ evaluacion: EvaluacionMandato }`. Verifica la firma del estado y la firma/hash de la cotización (igual que `/ejecutar`), corre `evaluarMandato` con el estado de ese momento (tipo, plazo y nominal salen de la cotización; el activo solo aporta id y nombre). Sin modelo, sin cadena y sin acceso de la demo: milisegundos. 400 `ESTADO_INVALIDO` / `DATOS_INVALIDOS`, 403 `COTIZACION_INVALIDA`, 409 `MANDATO_REVOCADO`. Tipos en `src/lib/mandato/tipos.ts`.
- `POST /api/mandato/ejecutar` `{ estado, evaluacion }` → `{ ejecucion: EjecucionMandato }`. **Exige el acceso de la demo** (como las otras escrituras). Solo ejecuta si `evaluacion.resultado === 'comprar'` (o si viene de una aprobación humana: `aprobado: true` en el body para `pendiente_aprobacion`), registra el cheque con la cotización y lo fondea. Si el contrato revierte (`CONCENTRACION_EXCEDIDA`, `INDUSTRIA_EXCEDIDA`, `LIQUIDEZ_MINIMA`, `SIN_LIQUIDEZ`…): `compra: null`, `rechazoContrato` con el código y el mensaje, y el estado queda igual. Si compra: actualiza `invertido`, `disponible`, `exposicionPorEmisor`, `compras`.
- `POST /api/mandato/rebote` `{ estado, chequeId }` → `ReboteMandato`. **Exige el acceso de la demo.** El oráculo marca el cheque como rechazado (`liquidarCheque(..., 'rechazado')`), el servidor lee la pérdida, bloquea al emisor, baja `invertido`, marca la compra como `Rejected` y arma `replanificar` (ids de la bandeja que habían sido omitidos por `presupuesto` o `tope_emisor` y que ahora podrían entrar, sin emisores bloqueados). `explicacion` en castellano. Rotulado simulado.
- `POST /api/mandato/revocar` `{ estado }` → `{ estado }` con `revocado: true` (firmado). Después de revocar, `/ejecutar` y `/agente/mandato` devuelven 409 `MANDATO_REVOCADO`.
- Informe: función pura `armarInforme(...)` en `src/lib/mandato/informe.ts` (la UI la llama con el estado, las evaluaciones, las ejecuciones, los rebotes y `GET /api/fondo` de antes y después).

En modo mock (`API_MODE=mock`) todas las rutas funcionan con el estado del mock de la API v2, sin tx reales (rotuladas de ejemplo), para poder probar la pantalla.

## Bandeja y demo
`shared/fixtures/mandato-bandeja.json`: ocho activos, **solo con CUIT ya existentes en `shared/fixtures/`**, y el mandato por defecto (`presupuesto` $40.000.000, banda mínima B, tope por emisor 15 %, plazo máximo 90 d, cheques y pagarés, cobertura mínima 100 %, `aprobacionSobre` null):
1. MercadoLibre, cheque, $9.000.000, 60 d → se compra.
2. MercadoLibre, cheque, $4.000.000, 45 d → el **contrato** lo rechaza (supera el 10 % del patrimonio).
3. Coto, cheque, $6.000.000, 30 d → se compra.
4. Cencosud, cheque, $5.000.000, 60 d → se compra y después **rebota** (`reboteSimulado: true`).
5. Pampa Energía, pagaré, $8.000.000, 90 d, garantía turbina eólica (valor declarado alto: cobertura ≥ 100 %) → se compra.
6. Loma Negra, pagaré, $6.000.000, 60 d, garantía camión → se compra.
7. Telecom, cheque, $3.000.000, 90 d → se compra.
8. Pampa Energía, pagaré, $3.000.000, 60 d, garantía terreno con valor declarado bajo (cobertura < 100 %) → **fuera de mandato** (cobertura).
Además, un campo "CUIT sorpresa" en la pantalla permite analizar y, si cumple, comprar cualquier CUIT con nominal y plazo a elección (mismo circuito).
`scripts/preparar-demo.mjs` gana la opción `--solo-pool`: carga solo a los inversores ($70 M y $30 M) y no compra nada; la corrida del mandato hace el resto.
El orden de la corrida: 1, 2, 3, 4, 5, 6, 7, 8; al final el rebote de Cencosud y la replanificación. Los análisis (lo lento: ~20-27 s cada uno con el gestor) se lanzan en paralelo desde el navegador (concurrencia 4 por defecto) con `soloAnalisis`; las evaluaciones (`/evaluar`) y las compras (`/ejecutar`) se hacen en el orden de la bandeja con el estado vigente, así que el orden de las compras y del estado es determinista. La replanificación reutiliza la cotización ya analizada. El tope de 60 s por llamada se respeta: cada llamada es o un análisis, o una evaluación, o una ejecución.

## Pantalla `/mandato` (`src/app/(ui)/mandato/page.tsx`, componentes en `src/components/`)
Una pantalla en cuatro bloques, mismo estilo y tokens que el resto, claro/oscuro, celular y proyector:
1. **Tus reglas:** formulario con el mandato (valores por defecto de `GET /api/mandato/bandeja`), cada regla con una explicación corta. Botón único **"Iniciar mandato"**. Opción "pedir mi aprobación por encima de $X".
2. **Corrida en vivo:** una línea de tiempo con una tarjeta por activo: pasos del agente en vivo (reutilizá `AnalisisAgente`), las razones del mandato (cumple/no cumple por regla, con ✓/✗ y texto), el resultado ("Compró", "Omitió", "El contrato dijo que no", "Esperando tu aprobación") con link a BaseScan cuando hay tx. Contadores en vivo: invertido, disponible, activos comprados/omitidos/rechazados.
3. **Controles:** **Pausar / Revocar mandato** (siempre visible mientras corre), y el interruptor "simular un rebote al final (demo)" (rotulado simulado). El campo "CUIT sorpresa".
4. **Informe final:** antes y después (patrimonio, liquidez, valor de cuotaparte), qué se compró, qué se omitió y por qué, qué rechazó el contrato, el rebote simulado (pérdida, emisor bloqueado, replanificación), links a BaseScan. Botón "Copiar resumen".
Reglas de pantalla: castellano rioplatense, es-AR, footer legal, estados de carga y error, "objetivo, no garantizado" donde corresponda, nunca "rinde", sin "IA" en los textos de pantalla, accesible. Agregar "Mandato" a la navegación principal.
