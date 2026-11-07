# Análisis de tracks HackaTwin — informe consolidado

> Hecho el 7-11-2026 entre las 09:30 y las 10:00, con 5 agentes de investigación (uno por track más uno de ecosistema) y verificación del agente principal.
> **Es una estimación estratégica, no una probabilidad de ganar.** Las etiquetas de evidencia son: HECHO / OFICIAL / INDIRECTA / INFERENCIA / HIPÓTESIS.

## Índice
| Archivo | Qué tiene |
|---|---|
| [belo.md](belo.md) | Track Belo: reglas, empresa, personas, 5 ideas, idea recomendada |
| [twin.md](twin.md) | Track Twin (Stablecoins): reglas, empresa, personas, comparables, 5 ideas |
| [ai.md](ai.md) | Track AI: autonomía, partners (Vercel y Firecrawl), costos, 5 ideas, demo |
| [blockchain.md](blockchain.md) | Track Blockchain (Avalanche): requisitos eliminatorios, bonus KUMPLY y 0xGasless |
| [ecosistema.md](ecosistema.md) | Evento, organizadores, sponsors, antecedentes, tendencias, contradicciones |
| [jurados.md](jurados.md) | Todas las personas identificadas (ninguna confirmada como jurado) |
| [track-ai-reglas.md](track-ai-reglas.md) | Texto oficial del track AI (no hay PDF) |

Fuentes oficiales locales: `Track Belo.pdf`, `track twin.pdf` y `HackaTwin — Blockchain Track Rules and Requirements (EN).docx.pdf` (en Descargas de Nacho), más el texto del track AI.

---

## I. Resumen
**Recomendación: competir en el track Belo, con la consigna #4 ("un agente que maneja tu plata con reglas que pone el usuario"), y construir el producto para que también cumpla las reglas del track AI** (sin humano en el medio).

La idea es un **agente que gestiona el fondo de cheques con un mandato del inversor**. El inversor fija sus reglas una sola vez. Después el agente analiza cada cheque, decide, fondea onchain, reacciona si un cheque rebota e informa el resultado, sin aprobaciones en el medio. El contrato funciona como un límite que el agente no puede pasar.

Por qué: (1) es justo lo que Belo tiene marcado como "próximamente" en su producto de banca agéntica (verificado en agentic.belo.app); (2) reutiliza el 80% de lo que ya funciona; (3) la misma demo sirve para Belo, AI y Twin.

## II. Lo que sabemos del evento
- **Tracks reales:** AI (partners Vercel y Firecrawl), Blockchain (Avalanche), Belo (5 consignas) y Twin (Stablecoins). **Actualización 7-11:** la slide oficial de jurados confirma que **el track Fintech existe y lo juzga Belo**. Ver [jurados/README.md](jurados/README.md).
- **Entrega: 17:30** (PDF de Belo). Twin y el SPEC dicen 18:00. Para ir seguros, tomamos 17:30.
- **Varios tracks a la vez:** ningún PDF lo regula. Solo el SPEC dice "se elige un solo track", sin fuente.
- **Jurados:** ninguno con nombre confirmado. Ver [jurados.md](jurados.md).
- **Belo:** 3,3 M de usuarios, Serie A de US$14 M liderada por Tether, y "Agentic Banking MCP v1" lanzado el 7-10-2026, con aprobación humana en cada movimiento. "Elegir permisos del agente" figura como próximamente (VERIFICADO en agentic.belo.app). El 28-10 hicieron su propio buildathon con 10 equipos, así que su jurado ya vio "un chat sobre datos simulados" y lo va a detectar.
- **CNV:** en marzo frenó ARGt por prometer 32% anual y levantó la medida en abril, después de que se sacara toda mención a rendimiento. **Nunca decir "ARGt rinde".**
- **Saturado:** "un agente que paga con límites" sobre datos simulados, remesas, cambio de monedas y chatbots. **El hueco:** crédito sobre un activo real, con datos verificables y reglas que hace cumplir el contrato.

## III. Premios (lo que dicen los documentos)
| Track | Premio | Fuente |
|---|---|---|
| Twin | **500 USDT y un kit de merch** | `track twin.pdf`, línea 18 |
| Blockchain | Un solo premio, sin monto publicado. Si no se cumplen los 6 requisitos, no se puede ganar. | PDF de Blockchain, líneas 7 y 23 |
| Belo | Sin monto. Pitch por grupo a las 18:00, final con 4 finalistas a las 19:30, premiación a las 19:45. | `Track Belo.pdf`, línea 15 |
| AI | No se menciona | `track-ai-reglas.md` |

## IV. Comparación de los tracks
Pesos: cumplir las reglas 20% · interés comprobado del jurado 15% · factible hoy con lo que tenemos 20% · diferenciación 15% · potencial de la demo 15% · riesgo 15% (más alto = menos riesgo).

| Track | Reglas | Interés | Factible | Diferenciación | Demo | Riesgo | **Total** | Según el agente |
|---|---|---|---|---|---|---|---|---|
| **Belo (#4)** | 8 | 9 | 8 | 7 | 8 | 7 | **7,9** | 6 → 8 si se reencuadra a la #4 |
| AI | 7* | 5 | 5 | 8 | 9 | 5 | 6,5 | 3 hoy → 7 tras el P0 → 8 con Firecrawl |
| Twin | 5 | 7 | 6 | 5 | 6 | 5 | 5,7 | 5 → 7 con una transacción con ARGt real |
| Blockchain | 2 | 4 | 3 | 6 | 5 | 3 | 3,7 | 3–4 → 6–7 con Fuji y KUMPLY |

\*Si se construye el circuito autónomo; hoy es 3. **Incertidumbre alta:** no hay jurados confirmados, no hay reglas sobre varios tracks, y faltan el tiempo y la cantidad de gente reales del equipo.

## V. Contradicciones encontradas
1. El SPEC y D1 dicen "Fintech", pero los PDFs no tienen ese track.
2. El SPEC dice "no hay criterios publicados", pero Belo y Blockchain sí los publican.
3. La entrega es a las 17:30 según Belo y a las 18:00 según Twin.
4. `docs/DEMO-SCRIPT.md` dice "nunca decir IA" y "¿el agente decide solo? No". Pero Belo puntúa el uso de IA con un 20% y el track AI exige autonomía.
5. Belo dice "el humano aprueba cada movimiento" y AI dice "sin humano en el medio". **Cómo se resuelve:** el humano aprueba el mandato una vez y el contrato garantiza el límite. Es justo lo que Belo tiene como "próximamente" (permisos del agente).
6. Twin pide que la lógica se construya durante el evento, y nuestros commits empiezan el 2-11. El README tiene que separar qué se hizo antes y qué hoy.

## VI. Proyecto propuesto: "Mandato"
- **Problema:** la pyme paga ~60% anual en el mercado informal, el ahorrista no sabe en qué cheques está, y darle plata a un agente da miedo.
- **Flujo:**
  1. El inversor (con KYC de Belo) fija su mandato: presupuesto, banda mínima, tope por librador y plazo máximo.
  2. Toca **un solo botón**.
  3. Por cada cheque de la bandeja, el agente consulta el BCRA (y opcionalmente noticias con Firecrawl).
  4. Valida el mandato en el servidor, con reglas fijas y sin depender del modelo.
  5. Decide y fondea onchain. Si el contrato rechaza la operación (40%), la registra y sigue.
  6. Si un cheque rebota, deja de comprarle a ese librador y vuelve a planificar.
  7. Entrega un informe final con el estado antes y después y los links a BaseScan.
- **Piezas nuevas:**
  - `src/app/api/agente/mandato/route.ts`: el orquestador. Va mostrando los pasos en vivo, un cheque por llamada para no pasar el límite de 60 s.
  - `src/app/(ui)/mandato/page.tsx`: la pantalla de reglas, el botón "Iniciar" y el log en vivo.
  - La política del mandato, con reglas fijas y tests.
- **Costo estimado:** ~US$0,007 de modelo por cada 5 cheques. Sale de lo medido en D17 (US$0,0013 por análisis). Firecrawl entra en su plan gratis.
- **No se toca** la demo actual (`/pyme`, `/demo`), que queda como respaldo.

## VII. Demo ideal (3 minutos)
1. Una frase de problema y la pantalla del mandato.
2. "Iniciar", y manos fuera del teclado:
   - MercadoLibre: fondeado, con su hash.
   - MercadoLibre 2: el contrato lo rechaza por el 40% y el agente sigue.
   - Telecom: el agente explica el antecedente viejo.
   - Un cheque fuera del mandato: **el agente decide no comprarlo** y explica por qué.
3. Cencosud rebota (simulado, y se dice en voz alta). El agente lo detecta solo, saca a ese librador y vuelve a planificar.
4. Informe final y links a BaseScan. Un jurado elige un CUIT sorpresa y el agente lo analiza en vivo.
5. La frase: *"Belo pide aprobar cada movimiento. Nosotros mostramos el paso siguiente: aprobás las reglas una vez y el contrato garantiza que el agente no se pasa. Pagás y cobrás en ARGt; el instrumento es el cheque."*

## VIII. Plan (de 10:00 a 17:30)
| Horario | Quién | Qué |
|---|---|---|
| 10:00–10:20 | Todos | Preguntas a los organizadores, pedirle ARGt a Twin, OK de Facu al cambio de pitch |
| 10:20–13:30 | Joaquín | Orquestador y política del mandato, con tests (`src/lib/agent`, `api/agente/mandato`) |
| 10:20–13:30 | Rama | Funciones de `src/lib/chain` para registrar, fondear y liquidar; atrapar los rechazos del contrato como decisiones |
| 10:20–13:30 | Nacho | La regla "no comprar" en scoring; Firecrawl solo si hay clave |
| 13:30–15:30 | Joaquín y diseño | Pantalla `/mandato`, informe final, links al explorador |
| 15:30–16:30 | Todos | Pruebas en producción, `pnpm demo:preparar`, video de respaldo |
| 16:30–17:15 | Facu | Ensayo del pitch ×2; README con Belo/Twin y qué se hizo hoy |
| 17:15 | — | Entregar. Sin cambios después de las 17:00. |

## IX. Riesgos y planes B
| Riesgo | Plan B |
|---|---|
| No se permiten dos tracks | Solo Belo; el circuito autónomo igual suma en "Uso de IA" |
| Infura u OpenRouter fallan en vivo | RPC de respaldo y análisis determinístico (ya existen), más el video |
| Más de 60 s por llamada | Una llamada por cheque, encadenadas sin clics |
| El orquestador no llega a las 15:00 | Demo actual con el pitch de la consigna #4 |
| No hay clave de Firecrawl | Queda como roadmap, no como adorno |
| Legal | Nunca "rinde"; "no es asesoramiento"; "rebote simulado" |

## X. Próximos pasos
1. **Preguntar a los organizadores** (issue #30): ¿existe el track Fintech? ¿Se puede competir en dos tracks? ¿Cuánto da cada premio y se pueden acumular? ¿La entrega es a las 17:30 o a las 18:00? ¿Quiénes son los jurados? Y **pedirles ARGt a los mentores de Twin.**
2. **Decisiones del equipo:** cambiar D1 y el guion (decir "agente de IA" y sacar "el agente no decide solo"); autorizar la transacción con ARGt real en mainnet; usar Firecrawl o no.
3. Spec y ticket del orquestador "Mandato" para Joaquín y Rama.
