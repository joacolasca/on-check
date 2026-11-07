# Ecosistema HackaTwin — análisis del agente

> Investigación web del 7-11-2026 (WebSearch es solo de EE.UU. y devuelve resúmenes; Luma, X y LinkedIn del evento no aparecieron). **No hay ninguna página pública de "HackaTwin".** Lo oficial son los 3 PDFs y el texto del track AI.

## Evento
- **Según el PDF de Twin:**
  - Sábado 7-11, Digital House, de 8 a 21 h, presencial, equipos de hasta 4.
  - 9:00 kickoff · 18:00 cierre de entregas · 19:00–21:00 demo day y premiación.
  - Presentan: Twin, Digital House, Avalanche, belo y Tether.
  - Premio Twin: 500 USDT y merch.
- **Según el PDF de Belo:**
  - 9:00 build · **17:30 entrega** · 18:00 pitches por grupo · 19:30 final con 4 finalistas · 19:45 premiación.
  - Criterios: Problema 30 · Funciona 25 · Producto 25 · IA 20. Se permiten datos simulados.
- **Según el PDF de Blockchain** (16-10-2026, autor "@sofi"):
  - Un solo premio, 6 requisitos y bonus.
  - "Open items to confirm": fechas, mentores, composición del jurado y quién valida los bonus.
- **Varios tracks:** ningún PDF lo regula. Solo el SPEC dice "se elige un solo track", sin fuente.

## Organizadores y sponsors
- **Twin Finance:** stablecoins locales; Twin Finance S.A.S. (Uruguay). CEO Rafael de Ambrosi (INDIRECTA). Mateo Moragues, Head of Ops & Finance: https://www.diadata.org/blog/post/twin-finance-damm-capital-latin-american-currencies-onchain (4-9-2026) e https://www.iproup.com/economia-digital/71858-propuesta-busca-tokenizar-el-peso-el-real-y-otras-monedas (25-9-2026).
- **Belo:** app cripto y de dólares digitales, primer integrador de las stablecoins de Twin, CEO Manuel Beaudroit. Tiene una API pública de precios (`api.belo.app/public/price`).
- **Digital House:** sede. Su rol más allá de eso no está confirmado.
- **Tether:** sponsor; USDT0 en los pools de Curve. [HIPÓTESIS] Aportaría el premio en USDT. También lideró la Serie A de Belo.
- **Team1 / Avalanche:** dueño del track Blockchain. 0xGasless y KUMPLY son partners de Avalanche.
- **Paisanos:** estudio y comunidad de tecnología y diseño de Buenos Aires (https://builtin.com/company/paisanosio, INDIRECTA). **Plugin:** no encontramos nada verificable. **Vercel y Firecrawl:** partners técnicos del track AI.
- **Contexto regulatorio:** la CNV frenó ARGt en marzo de 2026 y levantó la sanción en abril. https://www.iproup.com/economia-digital/66852-cnv-levanta-la-sancion-contra-belo-y-twin-por-la-stablecoin-del-peso-argt · https://www.criptonoticias.com/regulacion/cnv-argentina-ordena-parar-stablecoin-argt/

## Antecedentes
- No hay hackathons previos de Twin ni ganadores de HackaTwin.
- **Avalanche Summit LATAM Hackathon:** Buenos Aires, octubre de 2024, US$50.000 en premios (https://www.cronista.com/infotechnology/internet/un-hackathon-llega-a-buenos-aires-con-us-50000-en-premios-para-desarrolladores). Ganadores no verificados.
- **ETHGlobal Buenos Aires:** noviembre de 2025, 475 proyectos (https://www.kucoin.com/news/flash/ethglobal-buenos-aires-hackathon-announces-10-winning-projects-in-nft-defi-and-prediction-markets). Solo como referencia.
- **Belo Buildathon 001:** 28-10-2026, 10 equipos (agentic.belo.app).
- La carpeta "Hackaton Bitconf" de Descargas es **otro evento**.

## Tendencias y saturación [INFERENCIA]
- **Predecible:** wallets y remesas, "agente de IA que paga con límites" (aparece literal en Twin y Belo, así que va a haber muchos), cambio de monedas en Curve, detector de fraude, onboarding de "primera vez".
- **Menos saturado:** crédito o capital de trabajo con scoring sobre un activo real y trazabilidad onchain; también el cumplimiento regulatorio explícito.

## Qué gana en este tipo de evento [INFERENCIA, apoyada en las rúbricas]
- **Gana:** una demo de punta a punta en vivo con una transacción real y su hash; una frase de problema y de cliente; el token como parte central; un siguiente paso comercial concreto.
- **Queda en el promedio:** slides en lugar de producto, datos simulados sin avisarlo, IA decorativa, cinco features a medias.
- **Errores frecuentes:** prometer de más ("rinde"), no cumplir el requisito duro, depender del RPC sin respaldo, pasarse de tiempo, no separar lo hecho antes del evento.

## Contradicciones
1. El SPEC dice "AI, Blockchain o Fintech", pero los PDFs no tienen un track Fintech.
2. El SPEC dice "no hay criterios publicados", pero sí los hay.
3. Horarios: 17:30 vs 18:00; 9 h vs 12 h de build.
4. Solo Twin publica el monto del premio.
5. Twin tiene 6 o 7 stablecoins según la fuente.
6. "Un solo track" no tiene fuente.
