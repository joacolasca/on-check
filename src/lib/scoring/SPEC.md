# Spec del módulo scoring + cotización

Estado: escrito el 3-11-2026 por Nacho sobre el código real de `src/lib/scoring/`. Describe lo que **hace hoy** el módulo. Las reglas marcadas `TODO(confirmar con Facu)` son propuestas mías, no decisiones cerradas. La spec del equipo es `docs/SPEC.md`; los enchufes entre módulos, `docs/INTERFACES.md` (enchufe 2).

## 1. Qué hace

Dado el CUIT del **librador** (quien paga el cheque, S1), consulta la Central de Deudores del BCRA, calcula un puntaje de 0 a 100 con una banda (A a D) y, con ese puntaje, cotiza el cheque: tasa, descuento y precio de compra. Es la herramienta determinística del agente analista (D17) y la red de seguridad si el agente falla.

Fuera de alcance: el agente (`src/lib/agent/`), los contratos, la API y la UI. Este módulo solo expone dos funciones.

## 2. Interfaz

```ts
scoreLibrador(cuit: string, opts?: { modo?: "live" | "cache" | "auto" }): Promise<ResultadoScoring>
cotizar(input: InputCotizacion, scoring: ResultadoScoring, config: ConfigFondo): Cotizacion
```

- `scoreLibrador` limpia el CUIT (quita guiones y espacios) y lo valida antes de llamar al BCRA (sección 6).
- Modo (`opts.modo`, o la variable `BCRA_MODE`): `live` solo red; `cache` solo copia guardada; `auto` (por defecto) red con timeout de 3 s y, si falla, copia.
- `SCORING_MODE=mock` usa datos fijos de `mock.ts` (solo para tests).
- Tipos en `src/shared/types.ts` (no se tocan sin avisar).

## 3. Datos de entrada (BCRA)

Tres consultas a `https://api.bcra.gob.ar/centraldedeudores/v1.0`, en paralelo:

| Ruta | Se usa para |
|---|---|
| `/Deudas/{cuit}` | entidades del período más reciente: `situacion`, `monto` (miles de pesos), `refinanciaciones`, `situacionJuridica`, `procesoJud` |
| `/Deudas/Historicas/{cuit}` | total de deuda por período (24 meses) |
| `/Deudas/ChequesRechazados/{cuit}` | rechazos: fecha, causal, fecha de pago |

Respuestas especiales: 404 en `/Deudas` = el BCRA no conoce el CUIT (`CuitSinDatosError`, definitivo, no cae a la copia); 404 en `/ChequesRechazados` = sin rechazos (no es un error); cualquier otro error o timeout = cae a la copia en modo `auto`. Existe copia para 6 CUITs (`shared/fixtures/bcra/`): MercadoLibre, Coto, Cencosud, Pampa Energía, Telecom y Loma Negra.

## 4. Reglas de puntaje

Arranca en 100. Cada ajuste queda en `ajustes` con su motivo y puntos; el resultado se acota a 0–100.

| Regla | Puntos |
|---|---|
| Peor situación **material** (≥ 1 % de la deuda total) mayor que 1 | −15 por cada nivel sobre 1 (situación 3 = −30, 5 = −60) |
| Cheques rechazados **sin pagar** en los últimos 12 meses (cuenta uno solo, sin sumar por cantidad) | −25 |
| Alguna entidad con refinanciaciones | −10 |
| Proceso judicial o situación jurídica informada por el BCRA | −20 `TODO(confirmar con Facu)` |
| Deuda total del último período > 110 % de la de hace 6 meses | −5 `TODO(confirmar con Facu)` |

Detalles:

- Las entidades con situación 0 (sin deuda) se ignoran.
- **Materialidad:** una situación mala en una entidad con menos del 1 % de la deuda total no resta; se informa con 0 puntos. Si la deuda total es 0, todas cuentan. `TODO(confirmar con Facu)`
- **Rechazos:** la causal «DEFECTOS FORMALES» no cuenta como impago. Un rechazo con fecha de pago, o de hace más de 12 meses (el límite exacto de 12 meses todavía cuenta), tampoco. Los que no penalizan se informan con 0 puntos.
- **Deuda creciente:** se compara el total del período más reciente con el de hace 6 meses buscando el período por etiqueta AAAAMM (no por posición). Si no existe ese período o su total es 0, no se compara. En pesos nominales el umbral de 10 % se parece a la inflación del semestre: 6 de 18 CUITs reales la activaron. `TODO(confirmar con Facu)` si conviene otra regla.
- Fecha de «hoy»: la de Buenos Aires (America/Argentina/Buenos_Aires).

### Bandas

| Banda | Puntaje | ¿Se compra? |
|---|---|---|
| A | 85–100 | sí |
| B | 70–84 | sí |
| C | 55–69 | no (puntaje < 70) |
| D | 0–54 | no |

La banda ya no fija la tasa (desde el 7-11-2026): la tasa sale del puntaje (sección 5).

## 4b. Exclusión por cheques rechazados impagos (7-11-2026)
Aparte del −25 (ventana de 12 meses), `cotizar` nunca aprueba si `/Deudas/ChequesRechazados` informa un cheque **impago confirmado, de cualquier antigüedad**. Va primero en la cadena de `motivoRechazo` (antes de puntaje, plazo y montos) y el agente no puede revertirla. `antecedentesCheques(datos)` (`antecedentes.ts`) clasifica cada cheque:
1. Regularizado (`fechaPago` informada) o administrativo (causal `DEFECTOS FORMALES`): no excluye.
2. En revisión (`enRevision`, sin pago y no administrativo): no confirmado, se rechaza por datos insuficientes.
3. Impago confirmado (el resto): se rechaza con "El librador tiene N cheque(s) rechazado(s) sin pagar informado(s) por el BCRA (el último el D/M/AAAA, causal …)…".
4. No disponible (`DatosBcra.rechazadosVerificados === false`): falló en vivo (429, 5xx, timeout) y no hay copia; se rechaza. Un 404 en vivo, o `chequesRechazados: null` en la copia, es "verificado, sin rechazos". En `auto` se prueba la copia antes de marcar sin verificar.
Precedencia: impago confirmado > no disponible / en revisión > puntaje mínimo, plazo y montos. Como `ResultadoScoring` no cambia, `calcularPuntaje` deja la exclusión en `ajustes` con 0 puntos (prefijos `MARCA_IMPAGO` / `MARCA_SIN_VERIFICAR`) y `cotizar` la lee de ahí.

## 5. Cotización

Configuración (`config.ts`, un solo lugar; decisión S2 de `docs/DECISIONS.md`): TAMAR 24,0625 % TNA (2406 bps, BCRA variable 44, al 30-10-2026), plazo máximo 90 días, nominal de $1.000.000 a $50.000.000.

- `tasaTnaBps = clamp(TAMAR + (100 − puntaje) × 120, 3000, 6000)` (decidido el 7-11-2026; constantes `SPREAD_POR_PUNTO_BPS`, `TASA_MIN_BPS`, `TASA_MAX_BPS` en `config.ts`, función `tasaPorPuntaje`). Con TAMAR 2406: 100 → 30 % (piso), 95 → 30,06 %, 90 → 36,06 %, 85 → 42,06 %, 80 → 48,06 %, 75 → 54,06 %, 70 → 60 % (tope; daría 60,06 %). `spreadPorBandaBps` sigue en `ConfigFondo` (tipo compartido) pero ya no se usa.
- Puntaje mínimo 70 (`PUNTAJE_MINIMO`): debajo se rechaza (bandas C y D).
- `dias` = días corridos desde hoy (Buenos Aires) hasta el vencimiento (`AAAA-MM-DD` real; una fecha inválida lanza `Fecha de vencimiento inválida`).
- `descuento = nominal × tasaTnaBps × dias / (10.000 × 365)`, en centavos, redondeo half-up, sin `number`.
- `precioCompra = nominal − descuento` (la suma da exactamente el nominal).
- Se rechaza (`aprobada: false`, tasa 0, descuento y precio 0) con el primer motivo que aplique, en este orden: exclusión por cheques rechazados (4b), puntaje menor a 70, ya venció o vence hoy, plazo mayor a 90 días, monto menor al mínimo, monto mayor al máximo. La concentración (10 % por emisor, 25 % por industria, 15 % de liquidez mínima, v2) **no** la mira este módulo: la hace cumplir el contrato.
- `explicacion`: texto en castellano que cita banda, puntaje, ajustes y tasa ("TAMAR x % más un spread de y pp por el puntaje", con el piso o el tope cuando se aplican). Nunca usa «rinde» ni «rendimiento garantizado».

### Identificadores verificables

- `libradorHash = keccak256(cuit + CUIT_SALT)`: el CUIT no va en claro onchain. Sin la variable usa una sal de desarrollo; **en producción hay que definir `CUIT_SALT`** (el mismo valor que usa Rama).
- `id = keccak256` del JSON canónico de `{cuit, nominal, vencimiento, pyme, consultadoEn}`: cada cotización nueva tiene un id nuevo.
- `cotizacionHash = keccak256` del JSON canónico (claves ordenadas) de la cotización sin ese campo y sin `firma`. Si cambia cualquier campo, incluida la explicación, hay que recalcularlo.

## 6. Errores

| Situación | Resultado |
|---|---|
| CUIT que no es 11 dígitos con prefijo 20/23/24/27/30/33/34 y dígito verificador válido | `CuitInvalidoError` (sin llamar al BCRA) |
| El BCRA no conoce el CUIT | `CuitSinDatosError` |
| BCRA caído, lento (> 3 s), 429 o 5xx, y no hay copia | `Error` genérico («No pudimos consultar el BCRA…») |
| Monto con coma, negativo o texto | `Monto inválido` |
| Fecha de vencimiento inexistente | `Fecha de vencimiento inválida` |

`CuitInvalidoError` hereda de `CuitSinDatosError`, así `/api/cotizar` responde 404 `CUIT_SIN_DATOS` sin cambios en `src/app`.

## 7. Casos reales de referencia (BCRA, 3-11-2026)

| Librador | Puntaje | Qué muestra |
|---|---|---|
| Los 6 de demo (MercadoLibre, Coto, Cencosud, Pampa, Telecom, Loma Negra) | 95–100, banda A | caso base; Telecom tiene un rechazo de 2025 por defectos formales que no penaliza |
| YPF | 100 A | situación 5 con 0,00 % de la deuda: no resta (materialidad) |
| Arcor | 95 A | rechazo de 2022 por defectos formales sin pagar: no penaliza; deuda creciente |
| FUTBOL Y ALGO MAS SRL | 65 C | situación 3 con el 1,17 % de la deuda: sí resta |
| ORBE TEXTIL SRL | 40 D | 100 % de la deuda en situación 5 |
| TFM FRATELLI SRL | 0 D | situación 4, 171 rechazos sin pagar, refinanciaciones y situación jurídica |

Detalle de lo que apareció y cómo se resolvió: `docs/NOTAS.md` (nota «Scoring: CUITs reales») y `docs/handoff/scoring.md`.

## 8. Pendiente de confirmar con Facu

1. Umbral de materialidad de 1 %.
2. −20 puntos por proceso judicial o situación jurídica.
3. Si la regla de deuda creciente (> 10 % en 6 meses, −5) tiene sentido en pesos nominales.
4. Las interpretaciones del 3-11-2026: defectos formales no cuentan como impago, ventana de 12 meses, un CUIT desconocido es un error y no una banda A.
5. TAMAR, spread por punto, piso, tope y puntaje mínimo (S2, cambio del 7-11-2026).

## 9. Cómo verificar

`pnpm vitest run src/lib/scoring` · `pnpm typecheck` · `pnpm lint`. Prueba manual: `POST /api/agente/analizar` con un CUIT de `shared/fixtures/cheques-demo.json`. No hagas barridos masivos contra el BCRA: devuelve 429 tras ~60 consultas seguidas.
