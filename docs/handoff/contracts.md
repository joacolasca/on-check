# Handoff — contracts

**Dueño:** Rama (suplente: Joaquín). Implementación inicial hecha por Joaquín el 3-11-2026; Rama revisa, despliega y sigue con la capa chain.

**Estado (3-11-2026, comprobado):** `ChequeFund` y `MockARGt` **implementados**. `forge test`: 53 tests en verde (los 39 originales + 14 de casos borde en `test/ChequeFundBorde.t.sol` y `test/Deploy.t.sol`: inflación, donación directa, KYC revocado, baja del tope, pool vacío, liquidez, invariantes). El script corrió completo en anvil con chain id 84532. El pool de demo (20M + 10M) **no** lo carga el script: lo carga `pnpm demo:preparar` (Joaquín) apenas se despliega, y ese script se niega a correr si el fondo ya tiene fondos. **Falta desplegar en Base Sepolia** (necesita autorización de Rama y las wallets con ETH).

**Cómo funciona (para explicarlo al jurado):**
- Pool único ERC-4626 sobre ARGt. `totalAssets` = saldo del fondo + lo pagado por los cheques Funded (se valúan a precio de compra). Al **pagarse** un cheque entra el nominal y la cuotaparte sube; al **rebotar** se pierde el precio y baja.
- Las reglas duras viven en el contrato: tope de **40 % por librador** (`fondearCheque` revierte con `ConcentracionExcedida`) y **KYC** para depositar, rescatar y recibir cuotapartes.
- Lo comprado en cheques no se puede retirar: `maxWithdraw`/`maxRedeem` se limitan a la liquidez.
- El CUIT nunca va en claro (`libradorHash`) y la cotización queda verificable (`cotizacionHash`).

**Errores del contrato → códigos de la API:** `ConcentracionExcedida` → `CONCENTRACION_EXCEDIDA` · `SinLiquidez` → `SIN_LIQUIDEZ` · `SinKyc` → `SIN_KYC` · `EstadoInvalido`, `ChequeYaRegistrado`, `ChequeInexistente`, `DatosInvalidos` → errores 4xx. Depositar sin KYC revierte con `ERC4626ExceededMaxDeposit` (maxDeposit = 0).

**Cómo desplegar en Base Sepolia (solo con OK de Rama; desde `contracts/`, con el `.env` cargado: `set -a; source ../.env; set +a`):**
1. Antes: `git pull` en `main`; `test ! -e ../shared/deployments/base-sepolia.json` (si existe, **ya hay un deploy: no redesplegar**); ETH de testnet en deployer, originador, oráculo, inversor1 e inversor2 (la pyme no firma).
2. Simular **sin** `DEPLOY_OUT` y sin `--broadcast`: `forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL`. Ojo: el JSON se escribe en la simulación, antes de mandar las transacciones; por eso acá no se pasa `DEPLOY_OUT`.
3. Desplegar una sola vez: `DEPLOY_OUT=../shared/deployments/base-sepolia.json forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --slow`.
4. Si falla a mitad: **no relanzar**. Repetir el mismo comando con `--resume` (sigue desde `broadcast/Deploy.s.sol/84532/run-latest.json`). Si no se puede retomar, los contratos sueltos se abandonan (es testnet): borrar a conciencia el JSON, anotarlo en `docs/NOTAS.md` y volver al paso 1.
5. Comprobar en sepolia.basescan.org las dos direcciones, y con `cast call`: roles del originador y del oráculo, `kyc` de los inversores, saldo y `allowance` del oráculo. Commitear y pushear el JSON enseguida (así nadie redespliega).
6. Cargar las direcciones en Vercel y correr **una vez** `pnpm demo:preparar <URL>` (es el único que carga el pool de 30M; se niega si el fondo ya tiene fondos). Verificación en BaseScan opcional: `forge verify-contract` con `ETHERSCAN_API_KEY` (no probado todavía).

**Falta:** desplegar y verificar en BaseScan; revisión crítica de seguridad (Rama); pruebas de punta a punta con la API real.

**Cómo correrlo:** `pnpm install` (raíz) · `cd contracts && forge build && forge test` · `pnpm abi`.

**Decisiones y riesgos conocidos (revisar):**
- 1 peso = 1e18 en el contrato; `exposicion` baja al cerrarse un cheque (pagado o rechazado).
- El oráculo es una sola cuenta de confianza (en producción sería un oráculo real); `precioCompra` lo calcula el backend y el contrato no recalcula el descuento (D13).
- **Ataque de inflación del primer depositante (decidido por Rama el 3-11-2026: se mantiene `_decimalsOffset() = 0` en el MVP, sin tocar el contrato).** OZ 5.6.1 suma 1 cuotaparte y 1 activo virtuales: el ataque **nunca es rentable** para el atacante (fuzz en `ChequeFundBorde.t.sol`). Pero **sin pool inicial la víctima puede recibir 0 cuotapartes y perder todo su depósito** (donación 2M, depósito 1M: víctima pierde 1M, atacante pierde 500K). Con `pool_demo` (30M depositados por `pnpm demo:preparar` justo después del deploy: correrlo antes de cualquier otro depósito) la víctima pierde a lo sumo 1 wei y el atacante pierde casi toda su donación. Además, depositar exige KYC. **Para producción hace falta una revisión de seguridad adicional** (offset de decimales > 0 o depósito inicial bloqueado, y auditoría externa).
- No hay cancelación de cheques Pending: si uno choca con el tope queda Pending hasta que baje la exposición (testeado).
- Sin upgradeability. `ReentrancyGuard` en fondear, pagar y rechazar.
