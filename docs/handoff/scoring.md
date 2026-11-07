# Handoff — scoring

**Dueño:** Nacho (suplente: Joaquín). Implementación inicial hecha por Joaquín el 3-11-2026; revisión y bordes con CUITs reales hechos por Nacho el 3-11-2026 (issue #31, rama `feat/scoring-bordes`).

**Estado (3-11-2026, comprobado):** scoring **real** hecho y revisado. `pnpm test`, `typecheck` y `lint` pasan. Probado en vivo contra el BCRA con 24 CUITs (los 6 de demo y 18 más); los 6 de demo siguen en banda A. Detalle de los hallazgos en `docs/NOTAS.md` (nota "Scoring: CUITs reales").

**Spec del módulo:** `src/lib/scoring/SPEC.md` (reglas, bandas, cotización, errores, casos reales y pendientes). Si cambia una regla, actualizarla ahí también.

**Hecho:** `bcra.ts` (cliente con timeout de 3 s y respaldo en `shared/fixtures/bcra/`), `puntaje.ts` (reglas y bandas), `cotizar.ts` (tasa, descuento, adelanto, hashes, explicación), `cache.ts` (los 6 CUITs guardados), `dinero.ts` (montos sin `number`), `mock.ts` (datos fijos; tests con `SCORING_MODE=mock`). `index.ts` exporta `scoreLibrador` y `cotizar` con las firmas del enchufe 2.

**Decisiones de interpretación (revisar):**
- Rechazos con causal "DEFECTOS FORMALES" no cuentan como impago (no reflejan capacidad de pago).
- Cuenta un rechazo si no tiene fecha de pago y es de los últimos 12 meses. Los antecedentes que no penalizan se informan en `ajustes` con **0 puntos**.
- Deuda creciente: el total del último período supera en más de 10 % al de hace 6 meses (`/Deudas/Historicas`).
- Un CUIT que el BCRA no conoce (404 en `/Deudas`) es un error (`CuitSinDatosError`), no una banda A.
- Rechazado por: banda D, plazo > 90 días, vencido o monto fuera de $1M–$50M. Rechazada = `tasaTnaBps 0`, adelanto `"0"`.
- `id` = keccak256 del JSON canónico de `{cuit, nominal, vencimiento, pyme, consultadoEn}`: cada cotización nueva tiene un id nuevo (así se puede repetir la demo). `libradorHash` = `keccak256(toBytes(cuit + salt))` con `CUIT_SALT`; sin esa variable usa una sal de desarrollo. `cotizacionHash` = keccak256 del JSON canónico sin ese campo.

**Cambios de la revisión (3-11-2026, Nacho):**
- **Materialidad (1 %):** una situación 2 a 6 solo resta si la entidad pesa al menos 1 % de la deuda total; si no, se informa con 0 puntos. Motivo: YPF salía en D por $86 mil de $1,1 billones. Constante `UMBRAL_MATERIALIDAD_PCT` en `puntaje.ts`.
- **Proceso judicial / situación jurídica:** −20 puntos si alguna entidad con deuda los informa (`juridico` en `EntidadDeuda`, leído de `situacionJuridica` y `procesoJud`). Constante `PENALIZACION_JURIDICA`.
- **CUIT inválido:** `cuitValido()` (prefijo 20/23/24/27/30/33/34, 11 dígitos, módulo 11) corre antes de llamar al BCRA y lanza `CuitInvalidoError` (hereda de `CuitSinDatosError`: la API responde 404 `CUIT_SIN_DATOS`). Por eso los CUITs de los tests tienen que ser válidos (usar `30111111118`, no `30111111119`).
- **Deuda creciente:** el período de hace 6 meses se busca por etiqueta AAAAMM, no por posición. Los períodos de `/Deudas` se ordenan del más reciente al más viejo.
- **Fecha de vencimiento en `cotizar`:** se valida (AAAA-MM-DD real) y falla con `Fecha de vencimiento inválida` en vez de un `RangeError` opaco o de corregir en silencio `2027-02-30` al 2 de marzo. `/api/cotizar` ya validaba con `esFechaReal`; `/api/agente/analizar` solo valida que sea texto (si es inválida responde 502 `ANALISIS_FALLIDO`), sugerencia para Joaquín: usar también `esFechaReal` ahí.
- 19 tests nuevos de bordes en `scoring.test.ts` (bloques "bordes con datos reales del BCRA" y "validación del CUIT").

**Falta (pendiente de Facu, todas con propuesta por defecto):**
- `TODO(confirmar)`: el umbral de materialidad de 1 %.
- `TODO(confirmar)`: la penalización de −20 por proceso judicial.
- `TODO(confirmar)`: si la regla de deuda creciente (>10 % en 6 meses) tiene sentido en pesos nominales (6 de 18 CUITs reales la activaron; el umbral es parecido a la inflación del período).
- Las decisiones de interpretación de arriba (defectos formales, ventana de 12 meses, 404 = error) quedan **confirmadas por Nacho** tras probar 18 CUITs más, pero siguen pendientes de Facu.
- Caché de más CUITs solo si Facu quiere otros para la demo.
- El CI o la máquina pueden mostrar `api-sin-contrato.test.ts` con timeout de 5 s en la primera corrida en frío (pasa sola al repetir): es del módulo API, no del scoring.

**Cómo correrlo:** `pnpm test` · `pnpm typecheck` · `pnpm lint`. Prueba manual: `POST /api/agente/analizar` con un CUIT de `shared/fixtures/cheques-demo.json`.

**Gotchas (API del BCRA, probada el 3-11-2026):**
- Base `https://api.bcra.gob.ar/centraldedeudores/v1.0`. `/Deudas/{cuit}` trae `situacion`, `monto` (miles de pesos), `refinanciaciones`; `/Deudas/Historicas` no trae `refinanciaciones` e incluye entidades con situación 0; `/Deudas/ChequesRechazados` da 404 si no hay rechazos (no es un error).
- Para el deploy: poner `CUIT_SALT` en Vercel (el mismo valor que usa Rama para los hashes onchain).
- El BCRA responde 429 si se le piden ~60 consultas seguidas (visto en `/ChequesRechazados`): en modo `auto` se cae a la copia, que solo existe para los 6 CUITs de demo. Para CUITs sin copia, el usuario ve `BCRA_NO_DISPONIBLE`.
- Entradas inválidas en el BCRA: 400 si no son 11 dígitos o no es numérico, 404 si el dígito verificador no cierra (por eso se valida antes).
- `/Deudas` trae 2 períodos y `/Deudas/Historicas` 24; el último es el mes anterior (en nov-2026, septiembre).
- TAMAR: 2406 bps (24,0625 % al 30-10-2026, BCRA variable 44) en `config.ts`; actualizarlo si cambia.
