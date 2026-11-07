# Track AI — análisis del agente

> Fuente oficial: [track-ai-reglas.md](track-ai-reglas.md). Fase 1: comparación con el repo. Fase 2: investigación web (7-11-2026).
> Puntaje: **3/10 hoy → 7/10 tras el P0 (circuito autónomo, liquidación y log) → 8/10 con Firecrawl real y mandato firmado.**

## Fase 1 — Comparación con el repo

### Requisito → ¿cumplimos?
| Requisito | Estado | Evidencia |
|---|---|---|
| Agente que analiza solo, con herramientas | Sí | src/lib/agent/index.ts:37-94; herramientas.ts:13-28; analista-llm.ts; fallback en index.ts:110-113 |
| Pasos visibles en vivo | Sí | api/agente/analizar/route.ts:89-109 (NDJSON); CargarCheque.tsx:232 |
| El agente decide y ejecuta | **No** | index.ts:62-91 ("propone"); docs/handoff/agent.md ("no decide solo") |
| Sin humano después del disparador | **No** | ver la lista de abajo |
| Acción onchain autónoma | Parcial | api/cheques/[id]/fondear/route.ts:12-25: solo la dispara un clic |
| Monitoreo y liquidación autónomos | **No** | api/demo/liquidar + ControlDemo.tsx:23-24 (botón manual); el contrato no valida la fecha (ChequeFund.sol:133,145) |
| Disparador, cron o bandeja | **No** | — |
| Firecrawl | **No** | — |
| Vercel | Parcial | deploy con maxDuration=60 |

### Puntos donde hoy interviene un humano
- a) La pyme tipea el formulario (CargarCheque.tsx:177-191).
- b) **Botón "Aceptar y cobrar"** (CargarCheque.tsx:254, `aceptar`: 194-208).
- c) "Cotizar otro" / "Cargar otro cheque" (:255, :260, :280).
- d) **/demo, "Adelantar tiempo: pagado/rechazado"** (ControlDemo.tsx:23-24).
- e) KYC e inversión manuales (api/demo/kyc, api/demo/invertir).
- f) Acceso con clave o cookie de demo (api/_lib/acceso.ts).
- g) `pnpm demo:preparar` manual.
- h) El guion dice "¿El agente decide solo? No".

## Fase 2 — Investigación web

### Partners
- **Vercel:**
  - Workflow DevKit / DurableAgent para agentes durables. [OFICIAL] https://vercel.com/workflow · https://useworkflow.dev/docs/ai
  - AI Gateway. [OFICIAL/INDIRECTA]
  - **Cron:** en el plan Hobby corre **solo una vez por día** (±59 min); cada minuto solo en Pro. [HECHO] https://vercel.com/docs/cron-jobs/usage-and-pricing (15-7-2026). Para la demo: botón o `curl`, no cron.
- **Firecrawl:**
  - Change tracking (estados new/same/changed/removed; modos git-diff y json; json cuesta 5 créditos por página). [HECHO] https://docs.firecrawl.dev/features/change-tracking
  - Monitor programado, hasta cada 5 min, con webhook. [OFICIAL] https://docs.firecrawl.dev/features/monitor
  - Search: 2 créditos cada 10 resultados. Scrape: 1 crédito por página. Plan Free: 1000 créditos. [HECHO] https://www.firecrawl.dev/pricing
- **Jurado o DevRel de Vercel o Firecrawl en Argentina:** no encontramos a nadie.
- **Premio del track AI:** desconocido.

### Autonomía: qué se permite y qué no
- **Industria:** un workflow sigue caminos predefinidos en código; un agente dirige dinámicamente su proceso. Anthropic admite checkpoints humanos, **pero el texto del track los prohíbe y manda el track.** [OFICIAL] https://www.anthropic.com/engineering/building-effective-agents
- **Permitido:** definir el objetivo y las reglas al inicio, recibir el resultado al final. [INFERENCIA] También supervisión pasiva y revisión posterior.
- **Prohibido:** aprobar pasos, elegir entre opciones, corregir a mitad de camino, "confirmar" en cada paso, copiar y pegar entre herramientas, un chat que espera la próxima orden.
- **Zona gris:** un botón único "Iniciar" se acepta, porque el texto dice "se le da el objetivo o el disparador". Un cron, webhook o `curl` es todavía más seguro.

### Cómo demostrar la autonomía
1. Mandato inicial inmutable, con su hash en pantalla.
2. Log de decisiones en vivo: evidencia, decisión, motivo y hash de la transacción.
3. Estado inicial y final (totalAssets, exposición por librador, links a BaseScan).
4. Prueba de "sin humano": manos fuera del teclado y el log del servidor sin requests en el medio.
5. Manejo de errores: un fallo del RPC usa el respaldo; un rechazo del contrato (ConcentracionExcedida) queda registrado y el agente sigue.
6. **Un caso en que el agente decide NO actuar**, con su motivo.
7. Un CUIT sorpresa que elige el jurado.

### Costos (medido vs estimado)
- **Haiku 5.5 por OpenRouter:** $0,10/M de entrada y $0,50/M de salida. [HECHO] https://openrouter.ai/anthropic/claude-haiku-5.5
- **5 cheques:** ~US$0,0065 (lo MEDIDO por análisis en D17 multiplicado por 5); ~US$0,013 con reintentos (ESTIMADO).
- **Firecrawl:** ~20 a 60 créditos por corrida (ESTIMADO); entra en el plan Free.
- **Latencia por cheque:** ~20–35 s (10 s de agente MEDIDO, más Firecrawl y la transacción ESTIMADOS). **Cinco cheques seguidos pasan los 60 s** → una llamada por cheque.

### 5 ideas
1. **Gestor autónomo del fondo de cheques (nuestro repo) — RECOMENDADA.**
   - Flujo: mandato → bandeja → BCRA más Firecrawl (noticias o concurso del librador) → decide → fondea onchain → monitorea vencimientos → informa.
   - Esfuerzo: 6–8 h con dos personas.
2. **Tesorero autónomo para pymes en ARGt.** Factibilidad media; muchos robo-advisors.
3. **Vigilante de tasas de descuento de cheques con Firecrawl.** 3–4 h, pero es "solo un scraper".
4. **Agente de cobranza de cheques rechazados.** La demo es poco vistosa.
5. **KYC autónomo para Belo.** Riesgo legal y de datos personales; baja factibilidad.

Saturado: chatbots, resumidores, "agente que scrapea y avisa por Slack".

### Qué falta (P0 / P1 / P2)
- **P0** (3–4 h): `src/app/api/agente/procesar` (o `mandato`) en NDJSON. Por cada cheque: analizar, decidir, registrar y fondear (src/lib/chain), y capturar ConcentracionExcedida o SinLiquidez como decisión.
- **P0** (1–1,5 h): UI con un solo disparador y el stream, sin confirmación posterior.
- **P0** (1 h): `api/agente/vencimientos`, que llame a liquidarCheque (en la demo, simulado).
- **P1:** Firecrawl como herramienta `buscar_noticias`; informe final; cambiar el discurso a "decide y ejecuta, con el contrato como límite".
- **P2:** Vercel AI SDK o Cron; tests de la ruta.

### Demo recomendada (≈3 min)
Mandato y "Iniciar" → stream con los 5 cheques (fondea, el contrato revierte, decide no fondear, fondea, queda pending) → monitor de vencimientos → informe final y links a BaseScan.

### Riesgos
- Cambiar de track (D1).
- El pitch "propone y explica" contradice el track; necesita el OK de Facu.
- Firecrawl necesita clave y autorización.
- Un agente que firma transacciones: solo testnet, límites del contrato, rutas protegidas.
- Timeouts de 60 s y límites de requests: tener video de respaldo.
