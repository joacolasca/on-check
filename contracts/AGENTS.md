# contracts/ — Foundry (ChequeFund + MockARGt)
- **Qué es:** contratos del fondo. `ChequeFund` (ERC-4626 + AccessControl) y `MockARGt` (faucet de testnet).
- **Dueño:** Rama (suplente: Joaquín). Handoff: `docs/handoff/contracts.md`.
- **Interfaz que respeta:** `docs/INTERFACES.md`, enchufe 1. No cambiar firmas, eventos ni struct sin avisar.
- **Comandos:** `pnpm install` (raíz, trae OpenZeppelin y forge-std de npm) · `cd contracts && forge build && forge test` · `pnpm abi` (desde la raíz) exporta el ABI a `src/shared/abi/`.
- **Estado:** v2 implementada (ChequeFund + ChequeToken) con 106 tests; la v2 todavía no está desplegada (producción sigue en v1). Spec: `docs/V2-SPEC.md`. Deploy: `script/Deploy.s.sol`.
- **Reglas:** solo Base Sepolia para escribir. Nunca claves en el repo. Montos en wei (18 decimales). Tras cambiar el contrato, correr `pnpm abi` y commitear el ABI.
- **No tocar:** `src/shared/`, `src/app/(ui)/`, `src/lib/scoring/`.
