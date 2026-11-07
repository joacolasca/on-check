# Handoff — web

**Dueño:** Joaquín (suplente: Rama). **Specs:** `docs/V2-SPEC.md` y `docs/MANDATO-SPEC.md` (mandan); tipos en `src/shared/types.ts`.

**Estado (7-11-2026):** `pnpm typecheck`, `pnpm eslint src` y `pnpm vitest run` verdes. `/mandato` mirada en el navegador con un backend simulado desde `shared/fixtures/ui/mandato-*.json` (página temporal, no commiteada): corrida completa, pausa y reanudación, aviso de acceso, informe; 1280×720 (oscuro) y 375 px (claro), sin scroll horizontal. NO probada contra la API real del mandato (la hace otro agente).

**Hecho:**
- v2: panel con tortas, `/pyme` (gestor, garantía, balance), `/invertir` (cuotapartes, rescates), `/demo` (liquidar rescates, modo demo). Ver tests de `src/lib` y `componentes-v2.test.tsx`.
- `/mandato`: `MandatoForm` (reglas con valores de la bandeja, un botón), `CorridaMandato` (pantalla, contadores, controles fijos abajo, CUIT sorpresa), `TarjetaActivo` (pasos del agente plegables, razones ✓/✗, resultado y BaseScan, Aprobar/Omitir), `InformeFinal` (antes/después, compras, omisiones, rechazos, rebote, "Copiar resumen"). "Mandato" en `NavPrincipal`.
- `src/lib/mandato-client.ts` (cliente con `fetch` inyectable, NDJSON con evento `evaluacion`) y `src/lib/mandato-ui.ts` (`CorridaMandato`: máquina de estados con cola, pausa entre llamadas, revocación que espera la llamada en curso, errores por activo, pausa por acceso, aprobación, rebote + replanificación, sorpresa; formulario, contadores, informe y resumen). `mandato-ui.test.ts`: 21 tests con backend falso.

**Corrida en paralelo (7-11-2026):** `CorridaMandato` lanza los análisis de TODA la bandeja a la vez (`concurrencia`, por defecto 4, en `ConfigCorrida`; la sorpresa también) con `soloAnalisis: true` y el estado inicial. Los activos se procesan en el orden de la bandeja: cuando el análisis del que sigue está listo → `POST /api/mandato/evaluar` con el estado vigente → si da `comprar`, `/ejecutar`. Tarjeta en turno resaltada (`aria-current="step"`); las demás muestran "Analizando…" con los pasos plegados. Pausa: terminan los análisis en curso, no se lanzan más ni se ejecuta nada. Revocar: `AbortController` aborta los análisis. Un análisis fallido se reintenta una vez y no frena a los demás; un error al ejecutar no se reintenta. La replanificación reutiliza la cotización ya analizada. Medido en mock con modelo: 8 activos + compras + rebote en ~50 s (el análisis de cada activo tarda 18-27 s: es el cuello de botella; 4 en paralelo = 2 tandas).

**Rutas y campos que espera `/mandato`:** `GET /api/mandato/bandeja`, `POST /api/mandato/iniciar {mandato}` → `{estado}`, `POST /api/agente/mandato {estado, activo, soloAnalisis: true}` (NDJSON: `paso`/`reinicio`/`error` y final `{tipo:"analisis", cotizacion}`), `POST /api/mandato/evaluar {estado, cotizacion, activo:{id,nombre}}` → `{evaluacion}`, `POST /api/mandato/ejecutar {estado, evaluacion, aprobado?}` → `{ejecucion}`, `POST /api/mandato/rebote {estado, chequeId}` → `ReboteMandato`, `POST /api/mandato/revocar {estado}` → `{estado}`, `GET /api/fondo` (usa `totalAssets`, `liquidezBps`, `valorCuotaparte`). Códigos que trata: `NO_AUTORIZADO` (pausa y ofrece el ingreso), `MANDATO_REVOCADO` (cierra), `ESTADO_INVALIDO` (falla la corrida).

**Falta:** (1) probar contra la API real y ajustar; (2) el informe lo arma la UI (`armarInforme` en `mandato-ui.ts`), no `src/lib/mandato/informe.ts`: unificar si el backend lo expone; (3) botón "Reintentar" para un activo con error al ejecutar (no se reintenta solo: una compra podría haber salido); (4) pulido con proyector real.

**Cómo correrlo:** `pnpm install` · `pnpm dev` · `pnpm vitest run` · `pnpm typecheck` · `pnpm eslint src` (no `pnpm lint` a secas: recorre los worktrees). Sin backend: página temporal con `fetch` simulado desde `shared/fixtures/ui/mandato-*.json` (no se commitea).

**Gotchas:** montos siempre string decimal (`format.ts` usa bigint). Guardar y reenviar siempre el último `EstadoMandato` firmado. Tests de componentes con `renderToStaticMarkup`. Next regenera `AGENTS.md` al correr `next dev`: restaurarlo, no commitearlo. Nunca "ARGt rinde", "AI"/"IA" ni rendimiento garantizado. Rutas que firman piden la clave de la demo (`/api/demo/acceso`, 12 h).

**Pendiente de confirmar:** feriados en la fecha de rescate `TODO(confirmar)`.
