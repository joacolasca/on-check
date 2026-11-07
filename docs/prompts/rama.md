# Prompt de Rama — contratos, capa chain y API

## Antes de pegar el prompt (5 minutos)

1. Cloná el repo (ya te invité): `git clone https://github.com/joacolasca/hackatwin-fondo-cheques.git`. La Fase B está terminada: el esqueleto, los mocks, el ABI y el CI en verde ya están en `main`.
2. Instalá Node 20+, pnpm y Foundry. Foundry: `curl -L https://foundry.paradigm.xyz | bash` y después `foundryup`. Si la descarga falla (a Joaquín le dio error 500 de GitHub), usá `brew install foundry`.
3. Corré `pnpm install` en la raíz **antes** de `forge build`: OpenZeppelin y forge-std vienen de npm, no hay submódulos.
4. Creá una wallet **solo para testnet** y cargala con ETH de Base Sepolia (faucet). Joaquín te pasa por privado las variables de `.env.example` (claves de las wallets de demo, RPCs, `CUIT_SALT`).
5. Abrí Claude Code (o Codex) en la raíz, corré `/retomar contracts` (en Codex: escribí "retomar contracts") y, cuando te responda, pegá todo lo que está debajo de la línea.

---

Sos mi par técnico. Soy Rama, dueño de los **contratos, la capa chain y la API**, que tiene el camino crítico: la UI de Joaquín, el scoring de Nacho y el agente analista de crédito (D17) trabajan contra datos falsos hasta que lo mío esté listo, y la integración se hace apenas lo tuyo esté listo. El sábado 7 de noviembre compite el equipo en HackaTwin. **No podemos permitirnos errores**: priorizá que funcione, esté probado y sea simple.

Ya leíste `AGENTS.md`, `docs/handoff/contracts.md` y la sección del enchufe 1 de `docs/INTERFACES.md` con `/retomar`. Ahora leé también `docs/SPEC.md`, `docs/DECISIONS.md` (decisiones cerradas: no las re-discutas; fijate en D10, D17 y en las propuestas aprobadas de `docs/NOTAS.md`) y el enchufe 3 de `INTERFACES.md`. Nada más.

## Qué ya existe (no lo rehagas)

- `contracts/` con `MockARGt` completo y `ChequeFund` con todas las firmas, eventos, roles y struct. Las funciones revierten con `"TODO"`. 5 tests del esqueleto y ABI exportado a `src/shared/abi/` (`pnpm abi`).
- `src/app/api/`: las 9 rutas del enchufe 3 como **mocks** (datos de `shared/fixtures/api/`). El mock de `fondear` devuelve `CONCENTRACION_EXCEDIDA` con el id `0x…dead`.
- La UI completa (`/`, `/pyme`, `/invertir`, `/demo`) y el agente (`src/lib/agent/`, ruta `POST /api/agente/analizar`) son de Joaquín: **no los toques**. `/pyme` ya usa la ruta del agente, no `/api/cotizar`.

## Decisiones ya tomadas que te afectan

- **Unidades:** 1 peso = 1e18 en el contrato; la API habla en pesos (string decimal).
- **`exposicion[libradorHash]` baja** cuando el cheque pasa a Paid o Rejected.
- `marcarPagado` transfiere `nominal` desde el oráculo: esa wallet necesita mARGt y `approve` al fondo (mintear en el script de setup).
- **Concentración:** la hace cumplir el contrato (revierte). El agente solo avisa. La demo necesita ver esa reversión.
- Con un pool chico el primer cheque puede superar el 40 %: el script de datos de demo tiene que fondear el pool antes (`shared/fixtures/cheques-demo.json`, `pool_demo`).
- ARGt real en Base mainnet (solo lectura): `0xf016413834E6D1A14F3D628B11D6Ef725a6bdbDD`, verificada en docs.twin.finance el 2-11-2026.

## Reglas duras

- **Nunca borres ni modifiques nada en repos de GitHub que existían antes del 3 de octubre de 2026.** Solo trabajamos en este repo nuevo.
- Solo Base Sepolia para escribir. Base mainnet **solo lectura**.
- **Nunca commitees claves** ni imprimas las privadas. Todo por `.env`.
- **No inventes datos:** ni direcciones, ni CUITs, ni cifras. Si falta algo, `TODO(confirmar)`.
- Montos como `bigint` o string decimal, nunca `number`.
- **No cambies `docs/INTERFACES.md` ni `src/shared/types.ts` sin avisar a Joaquín en el grupo**: la UI, el scoring y el agente dependen de ellos. Si algo del diseño choca con la realidad, pará y preguntá.
- Trabajá solo en `contracts/`, `src/lib/chain/` y `src/app/api/` (salvo `src/app/api/agente/`, que es de Joaquín).
- Ramas cortas (`feat/contracts-…`, `feat/api-…`), PR chico con CI en verde, merge el mismo día. Nunca `push --force` a `main`.

## Tarea 1 — Contratos (lo más temprano que puedas: bloquea a todos)

1. **Planificá primero, sin código.** Cómo vas a llevar `totalAssets` (saldo de ARGt del fondo + suma de `precioCompra` de los cheques Funded), la exposición por librador, la regla de concentración, el KYC sobre ERC-4626 y los casos borde. Mostrame el plan en no más de 15 líneas y esperá mi OK.
2. Implementá `ChequeFund` según el enchufe 1, con OpenZeppelin (`ERC4626`, `AccessControl`, `SafeERC20`). Simple y legible: lo voy a tener que explicar frente al jurado.
3. **Tests con Foundry**, como mínimo:
   - Ciclo feliz: registrar → fondear → pagar; sube el valor de la cuotaparte.
   - Rechazo: registrar → fondear → rechazar; la pérdida baja `totalAssets`.
   - La concentración por encima del máximo **revierte**.
   - Sin liquidez suficiente revierte.
   - Solo direcciones con KYC pueden depositar o rescatar.
   - Solo los roles correctos pueden registrar, fondear y liquidar.
   - Transiciones inválidas revierten (pagar uno Pending, fondear dos veces).
   - El evento correcto en cada transición.
4. **Script de deploy** a Base Sepolia (`forge script`): despliega los dos contratos, asigna los roles a las wallets de demo, da KYC a los inversores de demo, mintea mARGt al oráculo y a los inversores, y escribe las direcciones en un archivo que la app lee.
5. Desplegá apenas estén los tests en verde (no hay día asignado: cuanto antes, mejor), verificá en BaseScan si se puede, regenerá el ABI (`pnpm abi`) y corré `/handoff contracts`.

## Tarea 2 — Capa chain y API real (apenas haya contratos desplegados)

1. En `src/lib/chain/`: clientes de `viem` (Base Sepolia para escribir, Base mainnet para leer ARGt real), las wallets de demo del lado del servidor (D7), funciones para leer el fondo y los cheques a partir de los **eventos** del contrato, y para armar los links a BaseScan.
2. Reemplazá **una ruta por vez** (`GET /api/argt-real` primero, que es la más simple; después `GET /api/fondo`, `GET /api/cheques`, `POST /api/cheques`, `/fondear` y las de demo) por la versión real, **sin cambiar la forma de la respuesta**. Cada ruta nueva lleva su test. Antes de cada merge, avisale a Joaquín qué rutas ya son reales.
3. Los errores del contrato (concentración excedida, sin liquidez) llegan a la UI como `{ error: { codigo, mensaje } }` con mensaje claro en castellano (`CONCENTRACION_EXCEDIDA`, `SIN_LIQUIDEZ`).
4. **Dos huecos que Joaquín necesita** (proponelos en el grupo antes de implementar, porque tocan el enchufe 3):
   - El estado de las wallets de demo (saldos de mARGt y ETH, y KYC de pyme, inversores, originador y oráculo): propuesta `GET /api/demo/cuentas`.
   - La wallet de la pyme: hoy `/pyme` la lee de `NEXT_PUBLIC_PYME_ADDRESS`. Lo mejor es que el servidor la ponga en la cotización.
5. **Para el agente (D17):** exponé en `src/lib/chain/` una función que devuelva `{ totalAssets, exposicionPorLibrador }` (tipo `CarteraActual` en `src/lib/agent/types.ts`) leída del contrato. Joaquín la conecta a la herramienta `ver_cartera_actual`. El `libradorHash` lo calculás con `CUIT_SALT`.
6. Cuando Nacho entregue `scoring`, conectá `POST /api/cotizar` a su módulo y confirmá con Joaquín el enchufe `POST /api/agente/analizar` en `docs/INTERFACES.md`.
7. Cerrá con `/handoff api`.

## Cómo trabajar conmigo

- Respuestas cortas: qué quedó, qué falta y qué necesitás de mí.
- Si aprendés algo que le sirva a otro módulo, una línea en `docs/NOTAS.md`.
- Si la conversación se hace larga, sugerime hacer `/handoff` y cortar con `/clear`, para ahorrar tokens.
- Explicame en dos líneas cada parte del contrato que el jurado pueda preguntar: quiero entenderlas, no solo tenerlas.

Empezá por el plan de la Tarea 1.
