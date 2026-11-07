# Plan de trabajo

## Equipo

| Persona | Rol | Disponibilidad |
|---|---|---|
| **Joaquín** | Web (toda la UI). Arma el esqueleto del repo, coordina y revisa. | Mucho tiempo y tokens |
| **Rama** | Contratos + capa chain + API + integración + deploy | Mucho tiempo y tokens |
| **Nacho** | Scoring + cotización (módulo chico y aislado) | ~Mitad de tiempo y tokens |
| **Facu** | Finanzas: responde preguntas, valida números y reglas, revisa lo que mostramos, da el pitch | No usa Claude Code |

**Por qué este reparto:** Nacho queda con el módulo más chico y que **no bloquea a nadie**: si se atrasa, la API sigue con el mock. Rama tiene el camino crítico (los contratos desplegados lo antes posible) y la integración; por eso es el que **más cuidado necesita**: Joaquín es su suplente y, como la UI trabaja contra datos falsos hasta la integración, puede ayudarle a revisar los contratos y los tests. Joaquín tiene la parte más grande y visible.

## Si alguien no está o se queda sin tokens

Sí, otro puede seguir su parte. Funciona porque:

1. **Cada módulo tiene un suplente** (tabla en INTERFACES.md).
2. **Cada sesión de Claude Code termina con `/handoff`**, que actualiza `docs/handoff/<modulo>.md` (qué está hecho, qué falta, cómo correrlo, próximo paso) y hace commit y push.
3. **Cada sesión empieza con `/retomar <modulo>`**: Claude lee el SPEC corto, las interfaces y el handoff del módulo, y no explora todo el repo. El suplente arranca en minutos y gasta pocos tokens.
4. **Push al menos al final de cada sesión.** El trabajo que no está en GitHub no existe para el suplente.
5. Los tests son la red: si el suplente rompe algo, CI lo avisa.

**Regla:** si a alguien le queda menos del ~20% de su límite semanal, avisa en el grupo y pasa a revisar o probar (no gasta tokens), y el suplente toma lo que falta.

## Orden de trabajo (por dependencias, sin días asignados)

**Nadie tiene un día asignado.** Cada uno avanza lo máximo que pueda cuando pueda: si alguien quiere hacer todo en un día, puede. Lo único que ordena el trabajo son las dependencias (etiquetas `bloquea` / `bloqueado` en los issues). La única fecha firme es la del evento: **sábado 7 de noviembre** (8:00 acreditación · kickoff 9:00 · **13:00 alcance congelado** · 18:00 entrega · 19:00 demo).

1. **Lo que bloquea a los demás:** contratos (`ChequeFund` implementado, con tests y desplegado en Base Sepolia) y scoring real (cliente del BCRA, reglas y `cotizar()`).
2. **Capa chain y API real**, una ruta por vez (necesita los contratos desplegados). Incluye los dos endpoints que faltan (`GET /api/demo/cuentas`, wallet de la pyme) y la cartera real para el agente.
3. **Integración:** la UI y el agente dejan los mocks y usan la API real; ciclo completo de punta a punta.
4. **Cierre de la demo:** pulido visual y mobile, deploy en Vercel, script de datos de demo, tag `demo-ready`, video de respaldo y ensayo del pitch ×3.

Los workshops de la semana (sin fecha fija; cuando se pueda): vayan al menos a uno y pregunten a los organizadores:
1. **¿Se puede llegar el sábado con código hecho durante la semana, o hay que escribirlo ese día?** Es la crítica: si no se puede, la semana se usa para diseño, specs, prompts y pruebas sueltas, y el sábado se construye con todo listo para Claude Code.
2. ¿Cuáles son los criterios de evaluación, quién es el jurado y cuál es el formato del pitch?
3. ¿Hay ARGt en testnet (faucet o contrato en Base Sepolia)? ¿Cuál es la dirección oficial en Base mainnet? Si hay uno en testnet, reemplaza a `MockARGt`.
4. ¿Hay premios por sponsor?

## Definición de "terminado" para el sábado (Fase 1)

- [ ] Ciclo completo en Base Sepolia: cargar cheque → puntaje del BCRA → Pending → Funded → Paid, y otro → Rejected.
- [ ] Un cheque **rechazado por la regla de concentración** (el contrato revierte y la UI lo explica).
- [ ] Panel público con todos los cheques, links a BaseScan, TIR y pérdidas visibles.
- [ ] Inversor de demo con KYC deposita mARGt y ve sus cuotapartes subir cuando un cheque se paga.
- [ ] ARGt real leído de Base mainnet en el panel.
- [ ] Funciona aunque se caiga la API del BCRA (caché).
- [ ] **Agente analista de crédito (central, D17):** analiza el cheque con el scoring propio como herramienta, y la UI muestra sus pasos. Si el agente falla o tarda, la cotización sigue saliendo con el scoring determinístico.
- [ ] Deploy en Vercel + tag `demo-ready` + video de respaldo grabado.

## El agente analista de crédito (parte central y obligatoria · D17)

Facu lo confirmó el 2-11-2026 (20:04): "un agente propio que analice calidad crediticia del cheque, con un sistema de scoring propio". **No es opcional ni Fase 2**: entra en la definición de "terminado".

- Un LLM con herramientas (`consultar_bcra`, `ver_reglas_del_fondo`, `ver_cartera_actual`, `emitir_cotizacion`) que razona sobre el cheque y propone la cotización. La UI muestra sus pasos en vivo. El contrato sigue haciendo cumplir las reglas duras (D10).
- El scoring determinístico (`src/lib/scoring/`) es el "sistema de scoring propio" y la herramienta del agente. Es también la red de seguridad: si el agente falla, la cotización sale igual.
- **Dueño: Joaquín** (2-11-2026), en `src/lib/agent/`. Suplente: `TODO(confirmar)`. Nacho y Rama no cambian su trabajo.
- **Diseño (decidido al empezar):** el agente **propone y explica; no decide solo**. Los números de la cotización salen siempre de `cotizar()` (scoring propio) y el agente nunca puede aprobar lo que las reglas rechazan. La concentración la hace cumplir el contrato: el agente solo avisa, para que la demo muestre la reversión. Si el agente falla, tarda o se pasa de pasos, se usa el analista determinístico.
- **Proveedor: Claude vía OpenRouter** (3-11-2026), modelo por defecto `anthropic/claude-haiku-5.5`; Sonnet 5.5 solo si en la comparación se nota mejor para el pitch. OpenRouter acepta el formato de la API de Anthropic, así que se usa el mismo SDK oficial. `TODO(confirmar)`: presupuesto de tokens, clave de API (sin clave, todo corre en modo determinístico) y en qué día entra al cronograma.
- `TODO(confirmar)`: nuevo enchufe en `docs/INTERFACES.md` (por ejemplo, el agente detrás de `POST /api/cotizar`, con una lista de pasos en la respuesta). No se toca `INTERFACES.md` sin confirmación.
- En textos para clientes y jurado no se usa la palabra "IA": se dice "agente" o "tecnología".

## Fase 2 (solo si la Fase 1, incluido el agente, está con tag `demo-ready`)

1. Subir la foto o PDF del ECHEQ y extraer los datos con visión.
2. Chat "preguntale al fondo" que responde con datos onchain.
3. QR al panel en la pantalla del pitch.

## Reglas de git

- `main` siempre funciona. Se trabaja en ramas cortas: `feat/<modulo>-<algo>` (ej. `feat/scoring-bcra-client`).
- PR chico → CI en verde → merge **el mismo día**. Al menos 2 merges por día por persona.
- Cada uno toca **solo su carpeta**. Para cambiar `src/shared/` o `docs/INTERFACES.md`, primero se avisa en el grupo.
- Cada PR cierra un issue (`Closes #N`). Los issues y las etiquetas están en GitHub (un solo hito: la entrega del sábado); ver `AGENTS.md`.
- Nunca se commitean claves. Las claves de testnet se pasan por privado; existe `.env.example`.
- Nunca hacer `push --force` a `main`.

## Cómo ahorrar tokens (para los tres)

1. **Arrancá siempre con `/retomar <modulo>` y terminá con `/handoff`.** Es lo que más ahorra: Claude no re-explora el repo.
2. **Una tarea = una conversación.** Al terminar, `/clear`. Si se hace larga, `/compact`.
3. **Modelo:** el más liviano para el día a día. El más potente solo para diseñar contratos, revisar seguridad o depurar algo trabado.
4. **Pedile un plan antes de que codee** ("planificá, no escribas código todavía") y revisalo. Corregir un plan es más barato que rehacer código.
5. **Nunca le pases el PDF de Facu.** Todo lo necesario está en `docs/SPEC.md`.
6. **No investigues dos veces lo mismo.** Lo que averigües (cómo responde la API del BCRA, un error raro de Foundry) va a `docs/handoff/<modulo>.md` o a `docs/NOTAS.md`.
7. **Pedí diffs chicos y concretos** ("agregá X en el archivo Y"), no "mejorá todo".
8. **Nacho:** su módulo está pensado para su presupuesto. Si se queda sin tokens, Joaquín lo sigue.
