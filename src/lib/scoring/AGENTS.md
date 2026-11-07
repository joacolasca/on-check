# src/lib/scoring/ — scoring del librador + cotización
- **Qué es:** `scoreLibrador` (BCRA, Central de Deudores) y `cotizar`. Scoring **real** (BCRA en vivo, respaldo en `shared/fixtures/bcra/`); los datos fijos de `mock.ts` solo se usan con `SCORING_MODE=mock` (tests).
- **Dueño:** Nacho (suplente: Joaquín). Handoff: `docs/handoff/scoring.md`.
- **Interfaz que respeta:** `docs/INTERFACES.md`, enchufe 2, y los tipos de `src/shared/types.ts`.
- **Spec:** `SPEC.md` en esta carpeta (describe lo que hace hoy el módulo; mantenerla al día).
- **Comandos:** `pnpm test` · `pnpm typecheck` · `pnpm lint`.
- **Config:** valores por defecto del fondo (S2) en `config.ts`: un solo lugar para cambiarlos.
- **Reglas:** timeout de 3 s al BCRA y fallback a `shared/fixtures/bcra/{cuit}.json`. Sin la palabra "rinde" en las explicaciones. Montos como string decimal. No inventar CUITs: `TODO(confirmar)`. Los CUITs de los tests deben tener dígito verificador válido (`cuitValido`). Reglas con `TODO(confirmar con Facu)`: materialidad 1 %, −20 jurídico, deuda creciente.
- **No tocar:** `src/shared/` (sin avisar), `contracts/`, `src/app/`.
