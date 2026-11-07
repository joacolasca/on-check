# Jurados de HackaTwin: investigación y estrategia

> Fuente de los nombres: la slide oficial "06_JURADOS" (7-11-2026). La investigación la hicieron 3 agentes en paralelo con fuentes públicas.
> Etiquetas: **[OFICIAL]** lo dijo la persona o su empresa · **[INDIRECTA]** prensa o terceros · **[INFERENCIA]** deducido del rol · **[HIPÓTESIS]** sin verificar.
> Detalle, preguntas y fuentes: [fintech-belo.md](fintech-belo.md) · [ai.md](ai.md) · [blockchain-stablecoins.md](blockchain-stablecoins.md).
> No sabemos qué piensa cada jurado. Este documento sirve para preparar buenas respuestas, no para manipular a nadie.

## I. Resumen ejecutivo
1. **El track Fintech existe y lo juzga Belo** (CEO, COO y 2 PMs). Eso resuelve la contradicción de D1. Es el track donde mejor encaja el proyecto actual (puntaje 7,9 en el análisis anterior).
2. **Los cuatro jurados empujan en dos sentidos distintos:**
   - **Belo** dice en público "el agente propone y el humano aprueba".
   - **AI** exige que no haya ningún humano después del disparador.
   - **Twin** pide al menos una transacción real con ARGt.
   - **Blockchain** pide un contrato en Avalanche verificado.

   Un mismo pitch no gana los cuatro. Hay que elegir un track principal.
3. **Una sola idea sirve para Belo y para AI:** **"permisos persistentes con límites"**. La persona aprueba las reglas (el Mandato) una vez y las puede revocar. El agente ejecuta dentro de esos límites y el contrato revierte lo que se pase. Belo tiene "elegir permisos del agente" como "próximamente" [OFICIAL], así que estaríamos resolviendo su función pendiente.
4. **La regulación es el tema más delicado.** La CNV frenó ARGt el 11-3-2026 porque prometía 32% de TNA [INDIRECTA]. Twin y Belo van a castigar cualquier "rinde". ARGt se presenta solo como medio de pago.
5. **Hay 7 de 19 personas o empresas sin identificar o sin verificar.** No les atribuimos ninguna opinión.

## II. Identificación de jurados
| Track | Jurado | Cargo (slide) | ¿Identidad verificada? |
|---|---|---|---|
| Blockchain | Mariano | Legal Counsel, Team1 Avalanche | **No** (falta el apellido) |
| Blockchain | Freddy | CTO, Axion Labs (Team1) | **No** (falta el apellido; no encontramos Axion Labs) |
| Blockchain | Sofía Priore | Regional Lead LATAM, Team1 | Probable ("Sofia Team1", host de las hackathons institucionales; posible autora "@sofi" del PDF) |
| Blockchain | Rocío Ferreiro | CTO y cofundadora, R3al Blocks | Sí (antes en IBM y Mastercard) |
| Fintech | Manuel Beaudroit | CEO y founder, Belo | Sí (alta) |
| Fintech | María Delamónica | COO, Belo | Cargo sí; trayectoria previa con evidencia baja |
| Fintech | Adriana Reyes | PM, Belo | Media; sin actividad pública |
| Fintech | Franco Ortiz | PM, Belo (figura como "Product Technical Manager") | Media; antes Frontend & Mobile Lead en Belo |
| AI | Joaquín Giorgis | CTO, The Ai Room | Persona sí (ex Naranja X y JPMorganChase, organizó Córdoba Hack); no encontramos The Ai Room |
| AI | Bautista Díaz Geliot | M&A, Credencial Boost | Persona probable (M&A en Accenture, UTDT); **Credencial Boost no aparece en ninguna fuente** |
| AI | Iván Domínguez de Álzaga | AI Leader, Flexways | Débil |
| AI | Nacho Vuotto | Head of Learning, Digital House | Sí |
| AI | Nahuel Alberti | CTO, Paisanos | Sí (también fue jurado de la Buildathon de Belo) |
| Stablecoins | Rafael De Ambrosi | CEO, Twin | Sí |
| Stablecoins | Mateo Moragues | Head of Ops & Finance, Twin | Sí |
| Stablecoins | Ariel Brassesco | CTO, Twin | **No** (no encontramos un vínculo verificable con Twin) |
| Stablecoins | Tomás Gómez Zelijoski | Fundraising, Credencial Boost | **No** |

## III. Perfiles: lo verificado más importante
- **Beaudroit:**
  - Trayectoria: Accenture, luego cofundador y CMO de Bitex (vendida a Huobi).
  - Dijo: "el usuario instruye, el agente propone y el humano aprueba"; "darle una cuenta a un agente colapsa la seguridad" (iProUP, 7-10-2026); "no queremos ser un banco" (2023). [OFICIAL/INDIRECTA]
  - Le importan la rentabilidad y la frugalidad. Relanzó Belo Business en B2B (9-9-2026), que no tiene producto de crédito.
- **Delamónica:** habla de las APIs B2B de Belo, rampas en Latam y regulación cripto en Brasil.
- **Ortiz y Reyes:** perfil de producto y técnico. Sin opiniones públicas.
- **Giorgis:** hace agentes (Elbi, turnos) y organiza hackathons. Según un snippet sin confirmar, Córdoba Hack tuvo un "FinTech Twin track". Va a revisar primero la regla de "sin humano".
- **Alberti:** dice que importan los resultados más que los entregables ("product engineer"). Paisanos se especializa en fintech y blockchain, y su blog pide agentes "trazables y auditables".
- **Vuotto:** referente educativo, lanzó "IA Argentina" (35.000 becas). Dijo que el programador necesita pensamiento crítico (Infobae).
- **Díaz Geliot:** M&A y finanzas. Va a mirar el modelo de negocio y el tamaño de mercado.
- **De Ambrosi:** ve las stablecoins locales como rieles de pago 24/7. Escribió "La regulación, bien construida, es también infraestructura" (17-5-2026) y sobre dar a los "emisores más pequeños" acceso a financiamiento (1-7-2026, RG 1150).
- **Moragues:** habló de las "finanzas agénticas". Firmó el PR #964 de DefiLlama (29-10-2026), que lista ARGt en **Avalanche**. El PR sigue abierto: la dirección hay que verificarla en el explorer antes de usarla.
- **Ferreiro:** le importan la seguridad, la escalabilidad y la transparencia.

## IV. Empresas: qué problema real tocamos
| Empresa | Qué hace | Cómo se conecta con nosotros |
|---|---|---|
| **Belo** | App cripto y de dólares digitales; Belo Business B2B; MCP de banca agéntica | Belo Business **no tiene liquidez para pymes**; los "permisos del agente" están pendientes; tiene a ARGt como integrador |
| **Twin** | Stablecoins locales (ARGt…) para pagos y liquidación | Volumen y casos reales de ARGt (156 holders en Base); el financiamiento a emisores chicos es su tema |
| **Team1 / Avalanche** | Comunidad y BD de Avalanche en LATAM | "DeFi para el mundo real" y productos que una empresa pueda adoptar |
| **R3al Blocks** | Infraestructura blockchain y tokenización [INFERENCIA por el nombre y el rol] | Activo real (cheque) con trazabilidad onchain |
| **Paisanos** | Estudio de producto, fintech y blockchain | Agentes auditables |
| **Digital House** | Educación tech, sede del evento | IA explicable y aprendizaje |
| **Credencial Boost / The Ai Room / Axion Labs** | **Sin información verificable** | Preguntarles en el evento; no suponer |

## V. Matriz jurado × proyecto
| Jurado | Intereses respaldados | Qué del proyecto le importa | Evidencia |
|---|---|---|---|
| Beaudroit | Agentes con humano que aprueba, seguridad, rentabilidad, B2B | Mandato aprobado una vez y revocable; límites en el contrato; modelo de ingresos | iProUP 7-10-2026 |
| Delamónica | B2B, APIs, regulación | Integración con Belo Business, operación real | Notas de eventos B2B |
| Ortiz / Reyes | Producto (inferido del rol) | Demo en vivo, UX de la pyme, fallback | Rol |
| Giorgis | Agentes, hackathons | Autonomía real, sin clics intermedios | Sitio personal, Córdoba Hack |
| Alberti | Resultados, agentes auditables | Log de pasos, explicación, links al explorer | Post "product engineer", blog de Paisanos |
| Vuotto | IA entendible | La explicación del scoring en castellano simple | Infobae |
| Díaz Geliot | M&A y finanzas | Mercado, unit economics, salida comercial | Perfil (Accenture/UTDT) |
| Domínguez de Álzaga | Backend e IA/ML (débil) | Arquitectura del agente, costo por análisis | Snippet |
| De Ambrosi | Rieles 24/7, regulación como infraestructura | ARGt como medio de pago central; cumplimiento | ebizlatam 2026 |
| Moragues | Finanzas agénticas | Agente que paga y cobra en ARGt | iProUP 25-9-2026, DefiLlama PR #964 |
| Brassesco | — (no verificado) | [INFERENCIA por CTO] integración real del token | — |
| Gómez Zelijoski | — (no verificado) | [INFERENCIA] caso de negocio y levantamiento de capital | — |
| Priore | Productos adoptables por empresas | Caso real, adopción | Hackathons de Team1 |
| Ferreiro | Seguridad, escalabilidad, transparencia | Tests del contrato, límites, CUIT hasheado | Universidad Austral 17-6-2025 |
| Mariano | — (no verificado) | [INFERENCIA por Legal] oferta pública, cesión del ECHEQ, KYC | — |
| Freddy | — (no verificado) | [INFERENCIA por CTO] contrato verificado y "Why Avalanche" | — |

## VI. Las preguntas más probables (top 12, una respuesta cada una)
La lista completa por jurado, con qué evalúa cada pregunta y qué mostrar, está en los tres archivos.
1. **"¿Esto es oferta pública?"** (Belo, Twin, Mariano) → Es un prototipo en testnet, sin dinero real. En producción operaría a través de un vehículo regulado (FCI cerrado o fideicomiso). `TODO(confirmar)` con un asesor legal. No improvisar.
2. **"¿Cómo pasa el ECHEQ al fondo?"** (Mariano, Beaudroit) → Por endoso o cesión electrónica en el sistema de ECHEQ. Onchain va el registro y el hash, no el título. Decirlo claro: el título no está tokenizado.
3. **"¿El agente decide solo?"** (Giorgis, Beaudroit) → Decide dentro de un mandato que aprobó una persona. El contrato impone los límites: KYC y tope del 40% por librador. Mostrar una reversión en vivo.
4. **"¿Y si el LLM se equivoca o no responde?"** (Alberti, Ortiz) → La política se aplica en el servidor y es determinística. El LLM explica; no aprueba solo. Hay un fallback sin LLM. Mostrar el log.
5. **"¿Por qué blockchain y no una base de datos?"** (Ferreiro, Priore) → Para que el inversor audite la cartera sin confiar en el administrador: cada cheque y cada pago es público y verificable.
6. **"¿Dónde está ARGt real?"** (De Ambrosi, Moragues) → Hoy solo lo leemos en mainnet. Si no tenemos una transacción real, decirlo de frente.
7. **"¿Cuánto gana el fondo y cuánto paga la pyme?"** (Díaz Geliot, Beaudroit) → Con la tasa de descuento del cheque. **Ninguna cifra sin fuente** (`TODO(confirmar)`), nunca "rinde".
8. **"¿Qué datos usa el scoring y qué pasa con la privacidad?"** (Ferreiro, Vuotto) → Datos públicos del BCRA por CUIT. El CUIT va hasheado con salt onchain.
9. **"¿Cuánto cuesta cada análisis?"** (Domínguez de Álzaga) → ~US$0,0013, medido (D17).
10. **"¿Cómo escala a miles de cheques?"** (Ferreiro, Alberti) → Una llamada por cheque, colas y límites del RPC. Base o Avalanche bajan el costo de gas.
11. **"¿Quién es el cliente que paga?"** (Delamónica, Díaz Geliot) → La pyme que necesita liquidez y los inversores del fondo. Distribución vía Belo Business. [HIPÓTESIS hasta validar]
12. **"¿Qué parte hicieron hoy?"** (Twin exige construir durante el evento) → Separar en el README lo previo de lo de hoy.

## VII. Debilidades detectadas (motivos por los que podríamos perder)
1. **No cumplimos ningún requisito duro de Twin ni de Blockchain:** no hay transacción con ARGt real ni contrato en Fuji.
2. **Contradicción de diseño:** "aprobación humana antes de registrar" choca con el track AI, y el botón "Aceptar y cobrar" lo descalifica.
3. **El modelo legal no está resuelto:** la cesión del ECHEQ, la oferta pública y el vehículo del fondo.
4. **Cifras de mercado sin fuente:** el tamaño del mercado de cheques y las tasas.
5. **La idea "fondo de cheques" existe offline** (Twin pide "algo que no exista"). La novedad tiene que estar en el agente con mandato y en la auditoría pública, no en el fondo en sí.
6. **Riesgo de demo:** RPC, timeouts de 60 s y LLM. Hace falta un video de respaldo.
7. **ARGt es un mock en testnet:** en Stablecoins se ve como decorativo.
8. **Hacemos demasiado:** BCRA, OpenArg, inflación, riesgo país y tasas en 3 minutos diluyen el mensaje. Sugerencia: quedarse con Central de Deudores y cheques rechazados; el resto, como roadmap.

## VIII. Estrategia de presentación
- **Narrativa:** "Las pymes tienen cheques y les falta liquidez. Hoy descontarlos es lento y opaco. Nuestro agente analiza cada cheque con datos oficiales del BCRA, compra dentro de reglas que vos aprobaste una vez, y cada operación queda auditable onchain."
- **Argumento central:** autonomía con límites verificables: el humano fija las reglas, el agente ejecuta, el contrato garantiza.
- **30 segundos:** el problema de la pyme, el agente con mandato y la prueba onchain, en tres frases y con el link al explorer.
- **2 minutos:**
  - 20 s: el problema.
  - 20 s: el mandato.
  - 60 s: la demo: 3–5 cheques. Uno se fondea, uno lo revierte el contrato por concentración, y uno el agente decide no comprarlo, con su motivo.
  - 20 s: modelo y siguiente paso (Belo Business o ARGt).
- **Versión técnica (preguntas):** arquitectura (Next.js → agente → política determinística → viem → ERC-4626), costo por análisis, fallback, tests de Foundry y privacidad del CUIT.
- **Qué remarcar según el track:**
  - **Fintech:** permisos y control, y el hueco de liquidez de Belo Business.
  - **AI:** cero clics después del disparador y el log.
  - **Stablecoins:** ARGt como medio de pago y la transacción real.
  - **Blockchain:** el "Why Avalanche" y el contrato verificado.

## IX. Recomendaciones priorizadas
1. **Ya:** confirmar en el kickoff si se puede competir en varios tracks y quién juzga cuál. Definir el track principal: **Fintech/Belo es el que mejor encaja.**
2. **Implementar el Mandato:** aprobación única y revocable, ejecución autónoma y log. Sirve para Fintech y AI a la vez.
3. **Ensayar las respuestas legales 1 y 2** y escribirlas en `docs/DEMO-SCRIPT.md` (lo decide el equipo, Facu es el dueño del pitch).
4. **Pedir ARGt a los mentores de Twin.** Transferencia real **solo con el OK explícito del equipo** (la regla del repo prohíbe escribir en mainnet sin OK).
5. **Verificar en el explorer** la dirección de ARGt en Avalanche antes de considerar el track Blockchain.
6. **Recortar el alcance de datos:** Central de Deudores y cheques rechazados.
7. **Grabar un video de respaldo** de la demo.
8. **Preguntarles en persona** qué es Credencial Boost y qué es The Ai Room.

## X. Fuentes
Cada archivo por track lista sus fuentes con URL, fecha y qué demuestra. Las más relevantes:
- iProUP, Beaudroit y la banca agéntica (7-10-2026); agentic.belo.app.
- ebizlatam, columnas de De Ambrosi (abril a septiembre de 2026); mercado.com.ar (14-4-2026).
- iProUP y diadata.org, Moragues (septiembre de 2026); DefiLlama PR #964 (29-10-2026).
- Infobae, Vuotto e "IA Argentina".
- Sitio personal de Giorgis y Córdoba Hack; blog de Paisanos.

Limitación: LinkedIn y X bloquean la lectura directa. Algunos datos vienen de snippets de búsqueda y están marcados así en cada archivo.
