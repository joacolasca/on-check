# Track Blockchain (Avalanche) — análisis del agente

> Fuente oficial: `HackaTwin — Blockchain Track Rules and Requirements (EN).docx.pdf` (5 páginas, fechado 16-10-2026). Fase 1: comparación con el repo. Fase 2: investigación web (7-11-2026).
> Puntaje: **3/10 hoy (no somos elegibles) → 6–7/10 con Fuji y KUMPLY.** Recomendación: **descartar**, salvo que haya un dev libre.

## Fase 1 — Requisitos y comparación con el repo

### Requisitos (PDF)
Hay un solo premio. "A project that does not meet all six requirements is not eligible for the track prize."
1. Smart contract en Avalanche (Fuji o mainnet, C-Chain o L1 propia), **verificado en el explorer**.
2. UI web o móvil integrada con los contratos (CLI o bot no vale).
3. "Why Avalanche": por qué Avalanche y no otra red, documentado en el repo.
4. Modelo de negocio.
5. Repo público con instalación, deploy y arquitectura.
6. Trabajo original del evento (el README separa lo previo).

**Jurado (100 puntos):** Impacto 25 · Uso de Avalanche 25 · Factibilidad técnica 20 · Modelo de negocio y escalabilidad 20 · Presentación 10. **Bonus:** 0xGasless hasta +10 y KUMPLY hasta +10. Desempate: puntaje sin bonus.

### Requisito → ¿cumplimos?
| Req | ¿Cumple? | Evidencia |
|---|---|---|
| 1. Contrato en Avalanche, verificado | **No** | Base Sepolia (shared/deployments/base-sepolia.json); verificación sin probar (docs/handoff/contracts.md:21) |
| 2. UI web | Sí | Next.js en Vercel |
| 3. Why Avalanche | **No** | — |
| 4. Modelo de negocio | Parcial | docs/SPEC.md (con supuestos) |
| 5. Repo público | Parcial | README de 29 líneas |
| 6. Original | Probable | falta aclararlo en el README |

### Qué falta
- **P0:** desplegar MockARGt y ChequeFund en Fuji (1–1,5 h), verificar en Snowtrace (0,5 h), adaptar `src/lib/chain` y `shared/deployments` (1,5–2 h, **necesita confirmación**), y correr `demo:preparar` en Fuji (0,5–1 h). **Total: 3,5–5 h.** Mitigación: una **segunda instancia**, sin migrar la de Base.
- **P0 docs:** "Why Avalanche" (0,5 h) y un README completo (1 h).
- **P1:** bonus KUMPLY (2–3 h). **P2:** 0xGasless (2–4 h, incierto).

## Fase 2 — Investigación web

### Ecosistema y personas
- Team1 es una red global de builders de Avalanche. Hubo un "Builders Connect Buenos Aires" (https://luma.com/axeztee2) y el Avalanche Summit LATAM en Buenos Aires, del 16 al 18-10-2024, con ~1500 asistentes (https://www.iproup.com/agenda/49966-avalanche-summit-latam-la-gran-cumbre-blockchain-llega-a-argentina). [HECHO]
- **No encontramos** nombres de líderes o DevRel de Team1 Argentina ni del jurado.
- [INFERENCIA] El jurado va a premiar el uso creíble de L1, compliance o finality, no "deploy en otra EVM".

### Bonus
- **KUMPLY** [OFICIAL] https://kumply.xyz/developers · https://kumply.xyz/blog/building-with-kumply-kyc-kyb-kya
  - SDK `@kumply/sdk` v1.3.0, con soporte de Fuji (43113). Se usa `isPersonAtLeast(addr, TIER.STANDARD)`, `isBusiness` e `isAgent`; `hasTier()` está deprecado.
  - Tiers: 1–3 KYC, 4 KYB, 5 KYA.
  - **Las verificaciones de prueba las emite el equipo de KUMPLY a mano** y hay que pedírselas hoy.
  - El código es simple (~2–3 h). Hay que mostrar una dirección que pasa y otra bloqueada.
- **0xGasless** [OFICIAL] https://docs.0xgasless.com
  - Paymaster ERC-4337, AgentKit, x402. Tienen un piloto de paymaster condicionado a la verificación de KUMPLY.
  - ~3–4 h, con riesgo.

### Saturado y huecos
- **RWA en Avalanche:** crecimiento de ~950% en 2025, más de US$1.300 M (BlackRock BUIDL, Apollo ACRED, Aave v4). [INDIRECTA] https://www.avax.network/business/real-world-assets · https://cointelegraph.com/news/aave-brings-v4-to-avalanche-laying-groundwork-for-tokenized-asset-lending
- **Saturado [INFERENCIA]:** vaults de T-bills, tokenización genérica, "agentes con x402", pagos gasless, gates de KYC triviales.
- **Hueco:** crédito de corto plazo con el riesgo medido sobre el pagador, con datos públicos reales (BCRA).

### 5 ideas
1. **ChequeFund en Fuji con KYC de KUMPLY** (5–7 h). Why Avalanche: finality rápida, compliance por verificación, L1 institucional como roadmap.
2. Lo mismo, más **KYB del librador** (+1–2 h).
3. **Agente KYA:** solo un agente verificado puede registrar cheques (+2 h).
4. **Gas patrocinado solo para verificados** (0xGasless más KUMPLY, +3–4 h, riesgo alto).
5. L1 propia permisionada: solo como diapositiva de roadmap.

**Recomendada:** 1 + 3, **solo si hay un dev libre** y KUMPLY entrega las verificaciones antes de las ~14:00. Si no, descartar. Cambia D2 y toca `shared/` y el módulo de Rama, así que necesita OK.

### Riesgos
- Sin Fuji verificado y sin "Why Avalanche", quedamos descalificados.
- Las verificaciones de KUMPLY son manuales.
- No se sabe quién valida los bonus.
- ARGt real solo existe en Base, así que la historia de Twin se debilita en Avalanche.
