# Track Twin (Stablecoins) — análisis del agente

> Fuente oficial: `track twin.pdf` (5 páginas). Fase 1: comparación con el repo. Fase 2: investigación web (7-11-2026).
> Puntaje: **5/10 hoy → 7/10 con una transacción con ARGt real e "idea 1" integrada · 4/10 sin transacción real.**

## Fase 1 — Requisitos y comparación con el repo

### Requisitos (PDF)
- **Consigna:** "producto que explore qué se puede hacer con moneda local en una infraestructura programable y componible, usando las Twin Stablecoins, con al menos una transacción onchain real en la demo".
- **Premio:** 500 USDT y un kit de merch.
- **Obligatorio (a):** usar al menos una Twin Stablecoin (ARGt…) en una chain elegible: Arbitrum, Base, Polygon, Ethereum o Avalanche.
- **Obligatorio (b):** al menos una transacción ejecutada por el producto, con el hash verificable en el explorer.
- "El token tiene que ser parte central de tu producto, no un agregado decorativo"; "ideas nuevas, no versiones onchain de productos que ya existen".
- **Entregables (18:00):** repo público con README que diga token, chain y direcciones; hash de la transacción; demo; pitch de 3 min más 2 min de preguntas. La lógica se construye durante el evento y "el historial de commits tiene que mostrarlo".
- **Jurado:** 4 criterios de 1 a 5, con el mismo peso: Idea, Problema, Negocio y Pitch.
- **Recursos:** ARGt en Base = `0xf016413834E6D1A14F3D628B11D6Ef725a6bdbDD` (coincide con `shared/fixtures/api/argt-real.json`); Curve ARGt/USDT0 y vault Morpho "ARGt Prime" en Arbitrum; bridge LayerZero; precio de belo en `api.belo.app/public/price`.
- **No hay ARGt en testnet ni faucet:** "Pedí tokens para testear" a los mentores de Twin o por Discord.
- **Otros tracks:** el PDF no dice si se puede competir en varios.

### Requisito → ¿cumplimos?
| Requisito | ¿Cumple? | Evidencia |
|---|---|---|
| Twin Stablecoin en chain elegible | Parcial: solo leemos ARGt real; operamos con MockARGt en Base Sepolia | src/lib/chain/argt.ts:8-14; contracts/src/MockARGt.sol:7; D6 |
| Transacción con hash | Parcial: en Sepolia sí, pero sin ARGt real; 0 en mainnet | ChequeFund.sol:79,129,141 |
| ARGt como núcleo | Parcial: el núcleo es el cheque; ARGt es el medio de pago (y simulado) | DEMO-SCRIPT.md, paso 4 |
| README con token, chain y direcciones | No | README.md |
| Demo desplegada | Sí (Vercel) | handoffs web/api |
| Pitch | Sí | docs/DEMO-SCRIPT.md |
| Historial construido en el evento | Riesgo: commits desde el 2-11 | git log |

## Fase 2 — Investigación web

### Empresa
- Se define como "infraestructura institucional para el sistema financiero onchain": stablecoins locales para pagos y liquidación. "No pagan rendimiento ni interés". Mint y redeem solo para integradores. Emisor: Twin Finance S.A.S. (Uruguay); Twin Finance Bermuda Ltd. (licencia clase M de la BMA) para activos tokenizados. Auditor: no se nombra. [OFICIAL] https://twin.finance
- **Seis stablecoins:** ARGt, BRAt, COLt, BOLt, CHLt y MEXt (el PDF lista 7). Casos que promociona: pagos en moneda local sin pasar por USD, nómina y pagos a proveedores cualquier día, pagos cross-border. [HECHO, prensa] https://mercado.com.ar/finanzas/america-latina-seis-stablecoins-en-moneda-local-todas-operativas-sobre-blockchain (14-4-2026)
- **Supply en Base:** 65.033.808,8 ARGt, 156 holders. [HECHO] https://basescan.org/token/0xf016413834E6D1A14F3D628B11D6Ef725a6bdbDD (7-11-2026)
- **CNV:** frenó ARGt en marzo de 2026 y levantó la medida en abril; hoy es un "medio de pago digital". [INDIRECTA] lanacion.com.ar; descubre.vc (15-4-2026)
- **Integraciones:** Belo (HECHO); Morpho, Curve y LayerZero solo figuran en el PDF.
- **Modelo de negocio, roadmap y fundadores:** no encontrados. Una fuente dice que antes se llamaba Num Finance (no verificado).
- **Por qué hacen HackaTwin:** [HIPÓTESIS] adopción de desarrolladores, casos de uso y volumen (156 holders).

### Personas
Ver [jurados.md](jurados.md): Rafael de Ambrosi (CEO) y Mateo Moragues (Head of Ops & Finance, habló de "finanzas agénticas").

### Comparables, saturado y huecos
- **wARS (Ripio):** ~USD 200k de volumen en dic-2025. https://cointelegraph.com/news/argentine-exchange-ripio-peso-stablecoins
- **Otros:** ARSs, DIPe. https://www.criptonoticias.com/mercados/carrera-stablecoins-peso-argentino/
- **Saturado [INFERENCIA]:** remesas y cambio BRL↔MXN, wallet de pagos, swap en Curve, pagos con QR, "yield" sobre ARGt (además, riesgoso legalmente).
- **Huecos [HIPÓTESIS]:** escrow condicional, nómina programada, agentes con presupuesto onchain, crédito a pymes liquidado en ARGt.

### 5 ideas
1. **Presupuestos agénticos en ARGt.** Una billetera con reglas (tope diario, lista de proveedores) y un agente que paga facturas dentro de esos límites; el contrato revierte lo que se pase. Esfuerzo: 4–6 h. Demo: 3 pagos salen bien y el cuarto se rechaza onchain.
2. **Nómina y proveedores programados en ARGt.** Esfuerzo: 3–4 h. Poca novedad.
3. **Escrow condicional de ARGt entre pymes.** Esfuerzo: 4 h. El oráculo es simulado.
4. **Crédito a comercios con repago automático** (idea 2 del PDF). Saturación alta, 6+ h.
5. **Fondo de ECHEQ liquidado en ARGt (nuestro repo).** Siendo honestos, **no pasa** el filtro de "algo que no existe": suma en Problema, Negocio y Pitch, no en Idea.

### Recomendada
Combinar las ideas 1 y 5: una tesorería de pyme con agente, que paga en ARGt real dentro de límites, con el fondo de cheques como caso de uso.

**Cómo conseguir la transacción real:** pedirles ARGt a los mentores (discord.gg/whU99xqnZ), hacer un `transfer` o un pago desde la wallet de demo y guardar el hash. **La regla del repo prohíbe escribir en mainnet sin OK explícito.** Plan B: Sepolia, explicándolo en el pitch (eso arriesga el requisito mínimo).

### Riesgos
- Hablar de rendimiento, retorno o TNA en el pitch.
- Commits anteriores al evento.
- No tener tokens a tiempo.
- Datos no verificados (integraciones, fundadores): no usarlos como hechos.
