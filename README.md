# On-Chain · Fondo de cheques y pagarés transparente · HackaTwin 2026

Prototipo para HackaTwin (sáb 7-11-2026, Digital House). Un fondo que compra cheques electrónicos de pymes, donde cada cheque es un registro público en Base y el inversor entra y cobra en ARGt.

**Prototipo en testnet · sin dinero real · no es oferta pública.**

## Para el equipo

- Qué hacemos: [`docs/SPEC.md`](docs/SPEC.md)
- Plan, roles, cronograma y reglas: [`docs/PLAN.md`](docs/PLAN.md)
- Interfaces entre módulos: [`docs/INTERFACES.md`](docs/INTERFACES.md)
- Decisiones cerradas: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Supuestos pendientes de confirmar con Facu: sección final de [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Guion de la demo: [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md)
- Tareas, bloqueos y datos por confirmar: issues del repo privado de origen (cómo se usan: sección "Issues" de [`AGENTS.md`](AGENTS.md))
- Prompt de arranque de Rama (contratos, capa chain y API): [`docs/prompts/rama.md`](docs/prompts/rama.md)

## Cómo trabajar con Claude Code o Codex

Las reglas viven en [`AGENTS.md`](AGENTS.md) (Codex lo lee solo; `CLAUDE.md` lo importa para Claude Code). Así podés pasar de uno a otro, por ejemplo si se acaba el límite semanal de uno, sin perder nada.

1. `git pull` y abrí el agente en la raíz del repo.
2. Decile **"retomar `<modulo>`"** (`contracts`, `api`, `scoring` o `web`). En Claude Code también existe `/retomar <modulo>`.
3. Trabajá en tu rama, con tareas chicas.
4. Decile **"handoff `<modulo>`"** antes de cerrar (en Claude Code, `/handoff <modulo>`). Esto deja todo listo para que otro siga, sea otra persona o el otro agente.

## Stack

Foundry + OpenZeppelin 5 · Next.js (App Router) + viem · Tailwind · Vitest · pnpm · Base Sepolia · Vercel
