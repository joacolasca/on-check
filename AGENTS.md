# On-Chain — fondo de cheques y pagarés transparente

Instrucciones para cualquier agente de código (Claude Code, Codex u otro). Este archivo es la **única fuente de verdad**: `CLAUDE.md` solo lo importa.

Prototipo para HackaTwin (sáb 7-11-2026). Un fondo que compra cheques electrónicos y pagarés de pymes. Cada activo es un registro público en Base; el inversor entra y cobra en ARGt.

## Antes de hacer nada
- Contexto del producto: `docs/SPEC.md`. Decisiones cerradas: `docs/DECISIONS.md` (no las re-discutas). Interfaces entre módulos: `docs/INTERFACES.md`.
- Si te pidieron trabajar en un módulo, leé `docs/handoff/<modulo>.md` y **quedate en esa carpeta**. No explores el resto del repo salvo que haga falta.
- No pidas el PDF original de Facu: todo lo necesario está en `docs/SPEC.md`.

## Módulos (carpeta → dueño)
- `contracts/` (Foundry) → Rama
- `src/lib/chain/`, `src/app/api/` → Rama
- `src/lib/scoring/` → Nacho
- `src/lib/agent/`, `src/app/api/agente/` → Joaquín (agente analista de crédito, D17)
- `src/app/(ui)/`, `src/components/` → Joaquín
- `src/shared/`, `shared/fixtures/`, `docs/INTERFACES.md` → compartidos: **no los cambies sin que el usuario lo confirme**

Módulos que se pueden pedir: `contracts`, `api`, `scoring`, `web`, `agent`.

## Comandos
- Instalar: `pnpm install`
- App: `pnpm dev` · Tests: `pnpm test` · Tipos: `pnpm typecheck` · Lint: `pnpm lint`
- Contratos: `pnpm install` primero (OpenZeppelin viene de npm), después `cd contracts && forge build && forge test`. ABI: `pnpm abi`.
- Deploy contratos (Base Sepolia): ver `docs/handoff/contracts.md`

## Reglas
- **Nunca borres ni modifiques nada en repos de GitHub que existían antes del 3 de octubre de 2026.** Solo se trabaja en este repo.
- **Solo testnet (Base Sepolia).** Nunca mainnet para escribir, nunca dinero real. Leer ARGt real en mainnet sí se puede (solo lectura).
- **Nunca commitear claves ni `.env`, y nunca imprimirlas.** Usar `.env.example`.
- **No inventar datos:** ni direcciones de contratos, ni CUITs, ni cifras de mercado, ni tasas. Si falta algo, marcalo `TODO(confirmar)` y avisá.
- **Nunca escribir "ARGt rinde" ni "rendimiento garantizado"** en UI, textos ni código. Footer obligatorio: "Prototipo · el fondo opera en testnet, sin dinero real · no es oferta pública".
- CUIT nunca en claro onchain: `keccak256(cuit ‖ salt)`.
- Textos de UI en castellano rioplatense (voseo).
- Cambios chicos, con tests. TypeScript estricto. Montos como string decimal o bigint, **nunca number**.
- No cambies una interfaz de `docs/INTERFACES.md` ni `src/shared/types.ts` sin confirmación: rompe el trabajo de otro dev.
- Ramas cortas (`feat/<modulo>-<algo>`), PR chico con CI en verde, merge el mismo día. Nunca `push --force` a `main`.
- Respuestas cortas: qué quedó, qué falta y qué necesitás del usuario.

## Issues de GitHub (cómo se organiza el trabajo)
- Cada entregable vive en un issue: https://github.com/joacolasca/hackatwin-fondo-cheques/issues. Uno por entregable, no por paso chico.
- Etiquetas: el módulo (`contracts`, `api`, `scoring`, `agent`, `web`, `demo`), `confirmar` (dato que falta: nunca se inventa), `bloquea` / `bloqueado` y `demo-critico`. No hay días asignados: hay un solo hito (la entrega del sábado) y lo que ordena el trabajo son las dependencias (`bloquea` / `bloqueado`). Cada uno avanza lo máximo que pueda cuando pueda.
- Antes de arrancar: `gh issue list --repo joacolasca/hackatwin-fondo-cheques --label <modulo>`, elegí uno y asignátelo.
- Rama `feat/<modulo>-<algo>` y PR con `Closes #N` (la plantilla ya lo pide).
- Si algo te bloquea, comentalo en el issue y ponele `bloqueado`. Al hacer `/handoff`, dejá un comentario corto con el estado (la fuente de verdad sigue siendo `docs/handoff/<modulo>.md`).
- Los comandos `gh` van siempre con `--repo joacolasca/hackatwin-fondo-cheques`.

## Procedimiento: RETOMAR `<modulo>`
Se activa cuando el usuario dice "retomar `<modulo>`" (en Claude Code también existe `/retomar <modulo>`).
1. Leé, en este orden y **nada más por ahora**: este archivo, `docs/handoff/<modulo>.md`, y en `docs/INTERFACES.md` la sección de ese módulo. `docs/SPEC.md` solo si el handoff no alcanza.
2. Corré `git pull` y los tests del módulo para confirmar el estado real, y mirá los issues abiertos del módulo (`gh issue list --repo joacolasca/hackatwin-fondo-cheques --label <modulo>`).
3. Respondé en no más de 8 líneas: estado actual (según los tests), próximo paso según el handoff, bloqueos o dudas.
4. **No escribas código todavía.** Esperá a que el usuario confirme la tarea.

## Procedimiento: HANDOFF `<modulo>`
Se activa cuando el usuario dice "handoff `<modulo>`" (en Claude Code también existe `/handoff <modulo>`). Sirve para que otro dev, otra cuenta u otro agente siga sin re-explorar.
1. Corré los tests y el typecheck del módulo y anotá el resultado real.
2. Reescribí `docs/handoff/<modulo>.md`, **máximo 40 líneas**: Estado (comprobado con tests) · Hecho en esta sesión (3–5 bullets) · Falta (priorizado) · Próximo paso concreto (con el archivo) · Cómo correrlo (comandos exactos) · Gotchas y aprendizajes · Pendiente de confirmar (`TODO(confirmar)`).
3. Si lo aprendido sirve a otros módulos, una línea en `docs/NOTAS.md`.
4. Commit en la rama actual y `git push`. Si la rama está lista y CI pasa, decilo para abrir el PR.
5. Respondé en 3 líneas: qué quedó, próximo paso y si el PR está listo.

## Ahorro de tokens (aplica a cualquier agente)
- Una tarea = una conversación nueva. Pedí un plan antes de codear y revisalo.
- No releas archivos grandes ni explores todo el repo. Lo que se averigua va a `docs/NOTAS.md` o al handoff.
