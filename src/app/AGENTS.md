# src/app/ — Next.js (App Router)
- **Qué es:** `api/` (rutas HTTP, enchufe 3) y `(ui)/` (páginas `/`, `/pyme`, `/invertir`, `/demo`).
- **Dueños:** `api/` → Rama · `(ui)/` y `src/components/` → Joaquín. Handoffs: `docs/handoff/api.md` y `web.md`.
- **Interfaz que respeta:** `docs/INTERFACES.md`, enchufe 3. Errores: `{ error: { codigo, mensaje } }`.
- **Comandos:** `pnpm dev` · `pnpm build` · `pnpm test` · `pnpm typecheck` · `pnpm lint`.
- **Estado:** las rutas de `api/` son reales cuando hay contrato configurado y devuelven `shared/fixtures/api/` cuando no (`_lib/chain.ts`).
- **Reglas:** la UI consume solo la API, nunca `lib/chain` ni `lib/scoring`. Footer legal en todas las páginas. Castellano rioplatense. Nunca "ARGt rinde".
- **Next.js 16:** leer `node_modules/next/dist/docs/` antes de usar APIs que no conozcas.
- **No tocar:** `contracts/`, `src/shared/` (sin avisar).
