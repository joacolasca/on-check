# Track Belo — análisis del agente

> Fuente oficial: `Track Belo.pdf` (2 páginas). Fase 1: comparación con el repo. Fase 2: investigación web (7-11-2026).
> Puntaje: **6/10 con el encuadre actual → 8/10 si se reencuadra a la consigna #4.**

## Fase 1 — Requisitos y comparación con el repo

### Requisitos (PDF)
- No hay API, SDK ni producto de Belo para integrar: "consignas abiertas, pensadas para arrancar rápido con datos simulados. Elegí una y construí algo que funcione."
- Hay que elegir **una** de 5 consignas:
  1. Plata sin fronteras.
  2. Finanzas para quien no tiene banco ("ahorrar, pedir crédito o invertir").
  3. Seguridad sin fricción (fraude).
  4. Un agente que maneja tu plata: "agente de IA que paga, ahorra o invierte por el usuario con reglas que pone él, y que explica cada movimiento".
  5. Tu primera vez (cripto o dólares digitales en minutos).
- **Criterios:**
  - Problema real, 30%: "problema concreto de un usuario de LatAm".
  - Funciona, 25%: "demo de punta a punta, sin slides en lugar de producto".
  - Se puede llevar a producto, 25%: "respeta límites regulatorios; un equipo de Belo podría continuarlo".
  - Uso de IA, 20%: "hace algo que antes no se podía, no decora".
- **Cronograma:** entrega a las 17:30, pitches por grupo a las 18:00, final con 4 finalistas a las 19:30, premiación a las 19:45.
- **Lo que el PDF no dice:** compatibilidad con otro track, cantidad de premios, ni si hay que declarar la consigna.

### Requisito → ¿cumplimos?
| Requisito | ¿Cumple? | Evidencia |
|---|---|---|
| Elegir una consigna | Parcial: no calza literal; lo más cercano es la #2 o la #4 | docs/SPEC.md:20-33 |
| Problema real de LatAm | Sí | docs/SPEC.md:20-26 |
| Demo de punta a punta | Sí | docs/DEMO-SCRIPT.md:14-24; src/components/Inversor.tsx:226 |
| Producto y regulación | Sí, fuerte (footer legal, nada de "rinde", sandbox de la CNV, KYC onchain, CUIT hasheado) | docs/SPEC.md:45-50; src/components/FooterLegal.tsx:2; contracts/src/ChequeFund.sol:201-217 |
| Uso de IA que no decora | Sí (Haiku por OpenRouter, BCRA, fallback determinístico) | src/lib/agent/analista-llm.ts:13-14 |
| "Agente con reglas del usuario" (#4) | No: el agente es del fondo y el inversor no fija reglas | docs/DEMO-SCRIPT.md:37 |

### Qué falta (fase 1)
- **P0** (0,5 h): declarar la consigna y orientar el pitch hacia ella.
- **P0** (0,5 h): resolver el "nunca decir IA" (DEMO-SCRIPT.md:25, src/lib/agent/AGENTS.md:6), porque Belo puntúa el uso de IA con 20%.
- **P1** (1–2 h): resumen del agente por inversor, o reglas del usuario en /invertir.
- **P1** (1 h): onboarding de "primera vez" en /invertir.
- **P2** (0,5 h): diapositiva "camino a producto con Belo".
- El KYC de demo (Inversor.tsx:68) es simulado; en producción no hay clave de admin (docs/DEPLOY-WEB.md:40). Decirlo en voz alta.

## Fase 2 — Investigación web

### Empresa
- **Producto:** billetera cripto, cuentas en fiat y pagos; tarjeta Visa "Lux" en USD; Mastercard en pesos; Belo Travel. [INDIRECTA] infonegocios.info (29-4-2026); descubre.vc (9-4-2026).
- **Usuarios y equipo:** 3,3 M de usuarios (80% en Argentina), meta de 6 M; 80 personas; soporte humano 365 días. [INDIRECTA, cita a Rager]
- **Plata:** Serie A de US$14 M liderada por Tether (mayo 2026) y "tres años de operación rentable"; expansión regional. [INDIRECTA] https://news.bitcoin.com/tether-leads-14m-series-a-for-argentine-wallet/
- **ARGt:** Belo fue el primer integrador de las stablecoins de Twin. [INDIRECTA]
- **CNV:** intimación del 11-3-2026 (ARGt tratado como valor negociable por prometer 32% anual), levantada el 9-4-2026. [OFICIAL/INDIRECTA] cnv.gov.ar; cronista.com; descubre.vc (15-4-2026)
- **PSAV:** "belo Argentina está registrada como PSAV ante la CNV… no brinda asesoramiento financiero". [OFICIAL] agentic.belo.app. El pitch no debe sonar a asesoramiento.
- **IA — Agentic Banking MCP v1 (VERIFICADO por el agente principal en agentic.belo.app):**
  - Herramientas disponibles: auth.sign_in, account.balances, account.yields, account.activity, exchange.fx, ramp.fiat_crypto, card.manage, transaction.approve.
  - **"Con aprobación humana en cada movimiento"**; el log muestra `HUMAN_APPROVAL_REQUIRED` / `WAITING_FOR_USER`.
  - **Próximamente:** "Elegir permisos del agente", límites de tarjeta, alertas proactivas, Belopay (Pix, Lightning).
  - Lista de espera, sin docs ni sandbox públicos.
  - Buildathon 001: 28-10-2026, 50 personas, 10 equipos.
  - Fuentes: https://agentic.belo.app · https://www.iproup.com/finanzas/72121-inteligencia-artificial-bancos-como-acceder-sistema-argentino-automatiza-cuenta · https://www.descubre.vc/noticia/belo-lanza-la-banca-ag-ntica-para-que-la-ia-gestione-cuentas-financieras-en-latam-2026-10-07
- **Competencia:** Ripio (25 M de usuarios, wARS), Buenbit (comprada por Nexo), Lemon; Ualá, Brubank y Naranja X no pueden ofrecer cripto. [INDIRECTA]
- **Dolores no resueltos:** Beaudroit dijo que darle una cuenta a un agente "colapsa por sus mecanismos de seguridad" [OFICIAL, iProUP]; los permisos del agente siguen como "próximamente". No encontramos un producto de crédito de Belo.

### Personas
Ver [jurados.md](jurados.md). Manuel Beaudroit (CEO) y Edwin Rager (Strategy Director). Ninguno confirmado como jurado.

### Saturado vs huecos por consigna [INFERENCIA]
| # | Saturado | Hueco |
|---|---|---|
| 1 | Remesas Pix↔ARS, comparador de comisiones | Tesorería para freelancers |
| 2 | Scoring alternativo con datos de la wallet, microahorro | Crédito sobre cobros futuros reales (cheques) con una fuente verificable (BCRA) |
| 3 | Detector de estafas con un LLM | Fricción adaptativa y explicable; protección de agentes |
| 4 | Chat "comprame USDT" sobre datos simulados, DCA | **Reglas del usuario que se hacen cumplir fuera del LLM, con explicación auditable** |
| 5 | Tutorial gamificado | Primera operación guiada, con el riesgo explicado en lenguaje simple |

### 5 ideas
| # | Idea | Consigna | Esfuerzo | Demo | Riesgo |
|---|---|---|---|---|---|
| 1 | **Agente inversor con reglas del usuario sobre el fondo de cheques** | 4 (+2) | 3–5 h | Muy alto | Medio |
| 2 | Guardia de permisos para agentes (motor de políticas en el contrato) | 4/3 | 4–6 h | Alto | Medio-alto |
| 3 | "Belo Cheque": la pyme descuenta su cheque con scoring del BCRA | 2 | 1–2 h | Alto | Bajo |
| 4 | Primera inversión guiada (KYC más cuotaparte en 3 min) | 5/2 | 2–3 h | Medio | Bajo |
| 5 | Copiloto de tesorería para freelancers | 1/4 | 6+ h | Medio | Alto |

### Recomendada: idea 1
- **Reglas del inversor:** "máximo 20% por librador, solo banda A o B, tope $X, no más de 90 días".
- **Qué hace el agente:** propone y explica con datos del BCRA. El servidor y el contrato hacen cumplir las reglas aunque el agente se equivoque.
- **Para Belo:** un producto de inversión sobre su base de usuarios, con el mismo patrón que su MCP.
- **No inventar una API de Belo.** Si se usan nombres estilo MCP, rotularlos como "mock, sin integración real".
- **Demo:** el usuario fija sus reglas → el agente propone → una orden fuera de regla se rechaza → otra pasa el filtro, pero el contrato revierte (40%).

**Nota del consolidado:** para que esto también cumpla el track AI, sacamos la aprobación por movimiento. El usuario aprueba el **mandato** una sola vez. Ver [README.md](README.md).

### Riesgos
- Nunca "rinde" ni "rendimiento garantizado". Belo usa "yields" en su MCP: no copiar ese vocabulario.
- No hay API pública de Belo.
- El jurado ya vio unos 10 equipos el 28-10.
- La entrega es a las 17:30.
