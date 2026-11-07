# V2 — Fondo de cheques y pagarés con gestor (PM)

Pedido de Facu del 6-11-2026, aprobado por Joaquín ("quiero todo"). **Fuente de verdad de la v2.** Los tipos TypeScript están en `src/shared/types.ts` (sección v2). Todo lo que no está acá no se inventa: si falta, `TODO(confirmar)`.

## Decisiones de Joaquín
- El MAV está **simulado** en la demo y se dice en pantalla ("MAV (simulado)"). Sin integración real.
- La **industria** la estima el agente (balance cargado, registros públicos del BCRA, criterio general). Se muestra "estimada por el agente" con su fundamento. No hay clasificador oficial.
- **Comisión:** 3 % anual sobre el patrimonio, devengada día a día (se emiten cuotapartes al receptor de la comisión).
- Producción actual (contratos v1) **no se toca**. La v2 se despliega aparte (copia de ensayo) y se verifica antes de promoverla.

## Reglas del fondo (política)
| Regla | Valor | Dónde se hace cumplir |
|---|---|---|
| Máximo por emisor | 10 % del patrimonio | contrato (`maxConcentracionBps = 1000`) |
| Máximo por industria | 25 % del patrimonio | contrato (`maxIndustriaBps = 2500`) |
| Liquidez mínima | 15 % del patrimonio, en ARGt (representa cuenta remunerada / money market, **simulado**) | contrato (`liquidezMinBps = 1500`) |
| Objetivo de rentabilidad | 40 % TNA neto de la comisión (≈ 43 % bruto con la comisión de 3 %; decidido el 7-11-2026) | solo informativo: **"objetivo", nunca una promesa** |
| Comisión | 3 % anual, devengada diaria | contrato |
| Cuotaparte | valor inicial $1.000; fondo acumulativo (reinvierte, sin dividendos) | contrato |
| Rescate | 24 horas hábiles, solicitado hasta las 15 hs (Buenos Aires); si es después, cuenta desde el siguiente día hábil. Feriados: no se consideran (TODO(confirmar)) | contrato + gestor |
| Lote de negociación | "Se negocia a mínimo 1.000 cuotapartes y de a 1" (Facu, confirmado por Joaquín el 7-11-2026): toda **suscripción** es de al menos 1.000 cuotapartes enteras (≈ $1.000.000 al valor inicial) y de a una (1.001, 1.002…; nunca fracciones). Los rescates **no** tienen mínimo. La comisión devengada emite fracciones y no es suscripción | contrato (`MIN_CUOTAPARTES`) |

## Contrato v2 (`contracts/`)
Se modifica `ChequeFund.sol`; se agrega `ChequeToken.sol`; `MockARGt.sol` no cambia.

**Struct `Cheque`** (se agregan campos antes de `estado`): `uint8 tipo` (0 cheque, 1 pagaré), `uint8 industria` (id de `shared/industrias.json`), `uint8 tipoGarantia` (orden de `TIPOS_GARANTIA`), `uint16 coberturaBps`, `bytes32 garantiaHash`. `registrarCheque(bytes32 id, Cheque calldata datos)` conserva la firma (struct ampliado). Validar `industria <= 12`, `tipo <= 1`, `tipoGarantia <= 9`.

**Reglas on-chain en `fondearCheque`:** además de la concentración por librador (ahora 10 %), exposición por industria `exposicionIndustria[uint8]` (máx. `maxIndustriaBps`, 25 %) y liquidez posterior `(balanceARGt − precioCompra) * 10000 >= liquidezMinBps * totalAssets()`. Errores propios: `IndustriaExcedida(industria, proyectada, maximo)`, `LiquidezMinimaInsuficiente(liquidezPosterior, minima)`. `_cerrarPosicion` también baja `exposicionIndustria`. Setters admin: `setMaxIndustriaBps`, `setLiquidezMinBps`, `setComisionAnualBps` (≤ 1000), `setFeeReceptor`, `setModoDemo`.

**Cuotaparte:** override de `_convertToShares/_convertToAssets`: con `totalSupply()==0` el precio es `PRECIO_INICIAL = 1000` pesos por cuotaparte (shares = assets / 1000); después `shares = assets * supply / totalAssets()` (sin offset virtual; si `totalAssets()==0` con supply>0, 0). 18 decimales. `convertToAssets(1e18)/1e18` = pesos por cuotaparte.

**Comisión devengada:** `comisionAnualBps` (300) y `feeReceptor` (default admin, con KYC). `_devengar()` se ejecuta antes de depósitos, solicitudes/liquidaciones de rescate, fondear y marcar*: con `dt` segundos desde `ultimoDevengo`, `f = comisionAnualBps * dt / (10000 * 365 days)` y se emiten `supply * f / (1 − f)` cuotapartes al `feeReceptor`. Vista `comisionPendiente()` (shares) y evento `ComisionDevengada(shares, hasta)`.

**Lote de negociación:** `MIN_CUOTAPARTES = 1000e18` (constante pública). `_deposit` (alcanza a `deposit` y `mint`) revierte `MinimoCuotapartes(shares, minimo)` si `shares < MIN_CUOTAPARTES` y `CuotapartesEnteras(shares)` si `shares % 1e18 != 0`. La forma correcta de suscribir es `mint(shares, receptor)` con `previewMint`; un `deposit` de ARGt que no dé cuotapartes enteras revierte. `_devengar()` no pasa por esta regla. API: `POST /api/demo/invertir { cuenta, cuotapartes }` (o `{ cuenta, monto }` en pesos → `floor(monto / valorCuotaparte)`), errores `MINIMO_CUOTAPARTES` y `CUOTAPARTES_ENTERAS`, respuesta `{ tx, shares, monto }`; `PoliticaFondo.minCuotapartes = "1000"`.

**Rescates:** `withdraw/redeem` estándar quedan deshabilitados (`maxWithdraw = maxRedeem = 0`). `solicitarRescate(uint256 shares) returns (uint256 id)` (KYC; las cuotapartes quedan en custodia del fondo), `cancelarRescate(id)` (solo el dueño, solo Pendiente), `liquidarRescate(uint256 id)` solo `GESTOR_ROLE`: exige `block.timestamp >= liquidableDesde` (salvo `modoDemo`), paga `convertToAssets(shares)` al valor del momento, exige liquidez (`SinLiquidez`), quema las cuotapartes. `liquidableDesde(uint64 ts) pure`: hora de Buenos Aires = UTC−3; si es sábado/domingo o ≥ 15:00 se cuenta desde el siguiente día hábil; el plazo vence a las 00:00 (BA) del siguiente día hábil. Eventos `RescateSolicitado(id, duenio, shares, liquidableDesde)`, `RescateLiquidado(id, duenio, shares, assets)`, `RescateCancelado(id)`. Vista `rescates(id)`, `cantidadRescates()`.

**Roles:** `GESTOR_ROLE` nuevo (el gestor/PM; en la demo la misma wallet del oráculo recibe `ORACULO_ROLE` y `GESTOR_ROLE`).

**Tokenización (`ChequeToken`):** ERC-721 "Activo del Fondo" (`ACT`), `tokenId = uint256(chequeId)`. Solo el fondo puede mintear/transferir/quemar (`setFondo(address)` una vez, la llama el admin tras desplegar). `registrarCheque` mintea el token a la pyme; `fondearCheque` lo transfiere al fondo; `marcarPagado` lo quema; `marcarRechazado` lo deja en el fondo. Los usuarios no pueden transferirlo. `tokenURI` devuelve un JSON `data:` mínimo (tipo, nominal, vencimiento).

**Eventos:** `ChequeRegistrado(bytes32 indexed id, bytes32 indexed libradorHash, Cheque datos)` (struct completo, para evitar *stack too deep*). El resto se mantiene.

**Deploy** (`Deploy.s.sol`): despliega MockARGt, ChequeToken y ChequeFund, `token.setFondo`, roles (originador, oráculo = ORACULO + GESTOR), KYC (inversores, pyme y feeReceptor), mint de mARGt, y escribe en el JSON de deployments `chequeToken`. Los tests de v1 se adaptan; hay tests nuevos de cada regla.

## Capa chain / API (`src/lib/chain/`, `src/app/api/`)
- `registrarCheque` arma el struct v2 desde la cotización (`tipo`, `industria.id`, garantía).
- `GET /api/fondo`: devuelve `ResumenFondo` v2 (política, composición por emisor/industria/tipo, liquidez, comisión, rescates pendientes). Etiqueta de emisor: nombre si el hash coincide con el de un emisor conocido de `shared/fixtures/cheques-demo.json` (se calcula `hashLibrador(cuit)` en el servidor; los CUIT no van en claro onchain).
- `GET /api/cheques`: `ChequeVista` v2.
- Rescates: `POST /api/demo/rescates` `{ cuenta, cuotapartes }` (firma el inversor), `GET /api/rescates` (lista `RescateVista[]`), `POST /api/demo/rescates/liquidar` (el gestor liquida los rescates vencidos o, con `modoDemo`, todos los pendientes; devuelve el detalle), `GET /api/demo/posicion?cuenta=` → `PosicionInversor`. Las que escriben exigen el acceso de la demo, igual que el resto.
- `POST /api/demo/invertir` suscribe cuotapartes enteras (mínimo 1.000, de a 1): ver "Lote de negociación".
- Mocks (`API_MODE=mock`) y `shared/fixtures/api/*.json` actualizados a la forma v2.

## Agente gestor (PM) (`src/lib/agent/`, `src/lib/garantias/`, `src/lib/mav/`)
Herramientas (todas devuelven datos; ninguna mueve fondos):
`ver_politica_del_fondo`, `consultar_bcra`, `ver_cartera_actual` (incluye exposición por industria y liquidez), `consultar_mav` (simulado, `shared/fixtures/mav-simulado.json`; siempre rotulado "MAV (simulado)"), `analizar_balance` (lee el texto de `input.balance` si existe; si no, usa solo BCRA y lo dice), `clasificar_industria`, `analizar_garantia` (si hay `input.garantia`), `emitir_cotizacion`, y concluye con `decisionPM`. Reglas de honestidad: no inventa datos que no estén en la entrada; si no pudo verificar algo, lo dice; la garantía es un análisis, la **prenda legal es un paso posterior** (se lista qué documentos faltan).
- **Garantías:** `analizarGarantiaBase(input, nominal)` determinístico con descuentos por tipo (confirmados por Facu el 7-11-2026): vehículo 30 %, inmueble 25 %, terreno 35 %, embarcación 40 %, energía (turbina) 45 %, pozo petrolero 55 %, fábrica 45 %, comercio/gimnasio 50 %, otra 60 %. El agente agrega riesgos, documentos pendientes (título de dominio/informe, tasación independiente, seguro, libre de gravámenes, etc.) y observaciones. `garantiaHash = keccak256(canonico(análisis))`.
- **Industria:** el agente decide con fundamento y fuentes; sin LLM cae a un mapa determinístico de los emisores de la demo (nombre de BCRA) y, si no, "Sin clasificar".
- **PM / rescates:** el endpoint de liquidación incluye una explicación del gestor (liquidez disponible vs. rescates, impacto en la reserva del 15 %).
- Cotización v2: `tipo`, `industria`, `garantia?`, `mav?`, `decisionPM?`. El `cotizacionHash` las cubre. Alertas del agente siguen siendo solo avisos: las reglas duras las hace cumplir el contrato.
- Sin la palabra "AI" ni "IA" en textos para el cliente: "agente" o "gestor".

## Pantallas (`src/components/`, `src/app/`)
- **Panel (`/`)**: hero con patrimonio, valor de cuotaparte (desde $1.000), liquidez vs. mínimo del 15 %, comisión devengada, objetivo (rotulado "objetivo, no garantizado"), rescates pendientes; **tortas SVG** (sin librerías) con selector: por emisor, por industria, cheques vs. pagarés; tabla de cartera con tipo, industria, garantía y cobertura; cada porción con monto y %. Bloque "Reglas del fondo" con los límites y sus consumos actuales.
- **`/pyme`**: selector cheque/pagaré, garantía opcional (tipo, descripción, valor declarado, documentos), balance opcional (pegar texto o subir `.txt`/`.csv`), resultado con decisión del gestor, MAV (simulado), industria estimada y análisis de garantía. 
- **`/invertir`**: el campo son cuotapartes enteras (mínimo 1.000, de a 1) con el costo estimado en pesos y el atajo "Mínimo (1.000 cuotapartes)"; solicitar rescate (con el aviso de plazo y corte de las 15 hs); posición y rescates.
- **`/demo`**: además de pagar/rechazar, "liquidar rescates" (el gestor) y un interruptor de `modoDemo`.
- Todo en castellano rioplatense; es-AR para números; footer legal; nunca "ARGt rinde".

## Datos de demo (v2)
Pool: Inversor 1 $70.000.000 e Inversor 2 $30.000.000 (patrimonio $100.000.000; con el máximo del 10 %, un cheque de MercadoLibre de $9.000.000 pasa y uno adicional de $4.000.000 al mismo emisor lo rechaza el contrato). Mezcla de cheques y pagarés de emisores con CUIT verificado ya existentes en `shared/fixtures/cheques-demo.json` (incluye al menos un pagaré con garantía). Los rebotes y garantías son **simulados** y se aclara en voz alta.

## Reparto del trabajo
1. **Contratos** (`contracts/`): todo lo de arriba, tests, `pnpm abi`.
2. **Agente** (`src/lib/agent/`, `src/lib/garantias/`, `src/lib/mav/`, `src/lib/scoring/cotizar.ts` solo para los campos nuevos de la cotización, `src/app/api/agente/`): herramientas y prompt del gestor, analizadores, fixtures.
3. **UI** (`src/components/`, `src/app/(ui)`, `src/lib/panel.ts`, `format.ts`, etc.): panel con tortas, formularios, rescates, usando la API v2 en modo mock.
4. **Chain/API** (`src/lib/chain/`, `src/app/api/` salvo `agente/`): después de que exista el ABI de contratos.
Cada uno corre `pnpm typecheck`, `pnpm lint` y `pnpm test` antes de terminar; nada de claves en el repo.
