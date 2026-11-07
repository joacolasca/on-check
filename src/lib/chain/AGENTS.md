# src/lib/chain/ — capa chain (viem)
- **Qué es:** lectura/escritura de `ChequeFund` y `MockARGt` con viem; lectura de ARGt real en Base mainnet (solo lectura).
- **Dueño:** Rama (suplente: Joaquín). Handoff: `docs/handoff/api.md`.
- **Interfaz que respeta:** consume el ABI de `src/shared/abi/` (enchufe 1) y alimenta `src/app/api/` (enchufe 3).
- **Comandos:** `pnpm test` (los de integración necesitan `anvil` y `cd contracts && forge build`; si no, se saltean) · `pnpm typecheck` · `pnpm lint`.
- **Estado:** implementada (3-11-2026) y probada contra contratos reales en anvil. Con `CHEQUE_FUND_ADDRESS` la API usa la blockchain; sin él, datos de prueba. Las claves de las wallets de demo vienen de `.env`, solo del lado del servidor.
- **Reglas:** montos como `bigint` o string decimal, nunca `number`. Nunca imprimir claves. CUIT nunca en claro: `keccak256(cuit ‖ salt)`.
- **No tocar:** `contracts/`, `src/lib/scoring/`, `src/app/(ui)/`.
