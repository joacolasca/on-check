# Handoff — agent (gestor PM, v2)

**Dueño:** Joaquín. **Spec:** `docs/V2-SPEC.md` (sección "Agente gestor (PM)"). El gestor solo ASESORA: las reglas duras las hace cumplir el contrato.

**Estado (6-11-2026, rama `worktree-agent-ad4b4725ae886292a`, comprobado):** `pnpm vitest run src/lib/agent src/lib/garantias src/lib/mav src/lib/scoring src/app/api/agente src/lib/agent-client.test.ts` pasa (189 tests, sin gastar API: cliente simulado); `pnpm lint` limpio; `typecheck` solo con los errores esperados de chain/estado, demo.test y panel.test.

**Hecho:**
- Herramientas (ninguna mueve fondos): `ver_politica_del_fondo`, `consultar_bcra`, `ver_cartera_actual` (`CarteraActual` con `exposicionPorIndustria?` y `liquidez?` opcionales), `consultar_mav`, `analizar_balance`, `clasificar_industria`, `analizar_garantia`, `emitir_cotizacion`, `concluir` ({decision: aprobar|aprobar_con_condiciones|rechazar, condiciones, motivo, resumen} → `decisionPM`).
- `src/lib/mav/` + `shared/fixtures/mav-simulado.json`: siempre `fuente: "MAV (simulado)"` con nota; datos inventados de demo (`"simulado": true`).
- `src/lib/garantias/`: `analizarGarantiaBase` determinístico (descuentos por tipo), `garantiaHash` = keccak256 del JSON canónico.
- `agent/`: `balance.ts` (lee texto pegado, no inventa), `industria.ts` (mapa de la demo; id 0 si no), `enriquecedor.ts` (llamadas puntuales al modelo para industria y garantía; con `AGENT_WEB_RESEARCH=1` por OpenRouter el modelo lleva `:online`), `entrada.ts` (validación), `politica.ts`.
- `cotizar()` acepta `extras` (industria, garantía, MAV, decisión del PM); `tipo` e `industria` siempre; el hash los cubre. El balance nunca viaja dentro de la cotización.

**Falta:** (1) La capa chain debe llenar `exposicionPorIndustria` y `liquidez` en `leerCartera` (hoy el aviso de industria y liquidez solo corre si vienen). (2) Probar con la API real (pedir OK de gasto). (3) Mock `shared/fixtures/api/cotizacion.json` sin campos v2 (`cotizarMock` los completa). (4) UI: pasos y campos nuevos.

**Cómo correrlo:** `pnpm vitest run src/lib/agent src/lib/garantias src/lib/mav src/lib/scoring src/app/api/agente` · `pnpm lint` · `pnpm dev` y `/pyme`.

**Ruta `POST /api/agente/analizar`:** entrada `{cuit, nominal, vencimiento, pyme?, tipo?, garantia?, balance?}`; devuelve `{cotizacion, pasos, alertas, modo}` (JSON o NDJSON con `accept: application/x-ndjson`).

**Gotchas:**
- Si el modelo falla, el respaldo usa herramientas sin modelo (`herramientasRespaldo`). `emitir_cotizacion` corre sola lo que falte antes (se ve como pasos).
- Alertas de emisor (10 %), industria (25 %) y liquidez (15 %): solo avisos. Nunca "rinde", "rendimiento garantizado" ni la sigla de la tecnología (`honestidad.ts`).
- La búsqueda web manda el nombre del emisor a un buscador: dejarla apagada con datos reales de clientes.

**Pendiente de confirmar:** descuentos por tipo de garantía confirmados por Facu (7-11-2026); liquidez y documentos por tipo, y el mapa de industrias de la demo, son criterio nuestro.
