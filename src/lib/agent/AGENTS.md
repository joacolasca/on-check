# src/lib/agent/ — agente analista de crédito (D17)
- **Qué es:** gestor (PM) del fondo: analiza cheques y pagarés con herramientas (`ver_politica_del_fondo`, `consultar_bcra`, `ver_cartera_actual`, `consultar_mav` (simulado), `analizar_balance`, `clasificar_industria`, `analizar_garantia`, `emitir_cotizacion`) y concluye con `decisionPM`. Deja sus pasos a la vista.
- **Dueño:** Joaquín. Handoff: `docs/handoff/agent.md`. Ruta: `src/app/api/agente/analizar`.
- **Interfaz:** tipos propuestos en `types.ts` (pendiente de confirmar en `docs/INTERFACES.md`). Usa `src/lib/scoring/` sin modificarlo.
- **Comandos:** `pnpm test` · `pnpm typecheck` · `pnpm lint`.
- **Reglas duras:** el agente propone, el contrato hace cumplir. Los números salen de `cotizar()`. Nunca aprueba lo que las reglas rechazan. Concentración: solo avisa. Sin "rinde" ni "rendimiento garantizado". Sin la palabra "IA" en textos para clientes.
- **Fallo:** si el analista falla, tarda o se pasa de pasos, se usa el determinístico (`modo: "determinista"`).
- **No tocar:** `contracts/`, `src/lib/scoring/` (es de Nacho), `src/lib/chain/`.
