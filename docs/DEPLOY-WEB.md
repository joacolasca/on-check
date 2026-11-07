# Deploy web (Vercel) y ensayo de la demo

Prototipo en testnet · sin dinero real · no es oferta pública. Nunca pegar claves en chats, issues ni commits.

## 1. Variables (solo **Production**; nunca en Preview ni Development)
Si las claves están en Preview, cualquier rama con preview las recibe. Las marcadas como secretas van como **Sensitive**.

| Variable | Valor | Secreta |
|---|---|---|
| `BASE_SEPOLIA_RPC_URL` | URL de Infura (Base Sepolia) | sí |
| `CHEQUE_FUND_ADDRESS` | `0x78f42a1843ACAA49C35657568D50F2d39cC027f0` | no |
| `MOCK_ARGT_ADDRESS` | `0xBfda095313e2F6e37Ef29DF4815Eb71E4D0490D6` | no |
| `CHEQUE_FUND_FROM_BLOCK` | `54059154` | no |
| `ADMIN_ADDRESS` | `0xbEee466dF9de8088a6dF8884B7Ea2102d5832C43` | no |
| `PYME_ADDRESS` | `0xF47DC042015a00D745AAfA621FB9A624702aD297` | no |
| `ORIGINADOR_PRIVATE_KEY`, `ORACULO_PRIVATE_KEY`, `INVERSOR1_PRIVATE_KEY`, `INVERSOR2_PRIVATE_KEY` | las del `.env` de Rama | sí |
| `CUIT_SALT` | **idéntica** a la del `.env` de Rama (con otra, cambia el hash del librador y el 40 % no ve los cheques ya cargados) | sí |
| `DEMO_CLAVE` (≥ 16), `COTIZACION_SECRETO` (≥ 32) | valores largos y aleatorios nuevos; la clave se le pasa al equipo por privado | sí |
| `OPENROUTER_API_KEY` | la de Joaquín (sin esto no anda la escena del agente) | sí |
| `AGENT_MODEL` | no cargar: sin definir usa Haiku 5.5 (decisión del 3-11-2026, `docs/handoff/agent.md`) | no |

**No cargar:** `DEPLOYER_PRIVATE_KEY`, `PYME_PRIVATE_KEY`, `API_MODE`, `CHAIN_DEPLOYMENT_FILE`, `INFURA_RPC_URL`, `ALCHEMY_RPC_URL`, `ETHERSCAN_API_KEY` ni nada con el prefijo `NEXT_PUBLIC_` que sea secreto. Opcionales: `BASE_MAINNET_RPC_URL` (si no, se usa la pública), `DEMO_TOPE_FONDO` (32M por defecto) y `BASE_SEPOLIA_RPC_FALLBACK_URL` (respaldo de las **lecturas** si Infura responde 429; por defecto PublicNode, no hace falta cargarlo). Las transacciones salen solo por `BASE_SEPOLIA_RPC_URL`.

## 2. Checklist del deploy
El recorrido paso a paso en Vercel está en `docs/VERCEL-PASOS.md`. Producción: https://hackatwin-fondo-cheques.vercel.app (proyecto en el equipo de Joaquín).

**Quién despliega:** Vercel (plan Hobby) solo despliega commits cuyo autor es miembro del proyecto. Los merges hechos por Rama quedan "Deployment was blocked"; el deploy de producción lo dispara Joaquín (merge suyo o *Redeploy* en Vercel). No contratar un plan pago por esto.

**Estado al 4-11-2026:** el commit 8251961 está desplegado y `verificar-deploy.mjs` da 9/9 "Todo en orden" (solo lectura). Falta:
- [ ] Mergear #44 (KYC leído de la cadena; sin esto `/invertir` no deja invertir en producción) y que Joaquín redespliegue.
- [ ] Prueba del agente con OpenRouter en producción (la hace Joaquín; cotizar no escribe en la cadena).
- [ ] Ensayo de la demo en el fork con el `main` final (sección 3).

- [ ] Repo conectado a Vercel, rama de producción `main` y CI en verde.
- [ ] Variables cargadas según la tabla, solo en Production. Las secretas, como Sensitive.
- [ ] Deploy hecho. `node scripts/verificar-deploy.mjs <URL>` termina en "Todo en orden" (solo lectura). Además, a mano: `GET <URL>/api/fondo` responde 200 con `totalAssets` 30000000, 2 Funded y 1 Pending (o el estado que corresponda).
- [ ] `GET <URL>/api/demo/cuentas`: 6 cuentas, con las direcciones de arriba. `GET <URL>/api/argt-real` responde 200.
- [ ] `<URL>/api/demo/acceso` acepta la clave. Una ruta que firma, sin la cookie, responde 401/403.
- [ ] Buscar en el JS del cliente (DevTools → Sources) `PRIVATE_KEY`, `0x` + 64 hex y la URL de Infura: no tiene que aparecer nada.
- [ ] Con la sesión de la demo, `POST /api/demo/kyc` responde 503 `CONFIGURACION` (sin sesión, 401). Es lo esperado: no hay clave de admin.
- [ ] Revisar el ETH de originador y oráculo en `/api/demo/cuentas` (gas real ~0,006 gwei).
- [ ] **No** tocar el estado del fondo desde producción hasta la demo: nada de cotizar y registrar ni liquidar.

## 3. Ensayo en un fork local (no toca Base Sepolia)
Cada escritura de la demo es irreversible en Base Sepolia (liquidar no tiene vuelta atrás). Se ensaya contra un fork:
1. `anvil --fork-url "$BASE_SEPOLIA_RPC_URL" --port 8546` (copia local; reiniciarlo vuelve al estado real).
2. Cargar ETH a las 4 wallets que firman, **solo en el fork**: `cast rpc --rpc-url http://127.0.0.1:8546 anvil_setBalance <dirección> 0xDE0B6B3A7640000`. anvil sugiere una propina de 1 gwei y sin esto da `SIN_GAS`.
3. Correr la app desde una copia del repo **sin `.env`**, pasando solo las variables de la tabla, `BASE_SEPOLIA_RPC_URL=http://127.0.0.1:8546` y **`BASE_SEPOLIA_RPC_FALLBACK_URL=http://127.0.0.1:8546`** (`env -i … pnpm start`). Sin la segunda, si anvil tarda, las lecturas pasan a Base Sepolia real y la UI mezcla estados (las transacciones igual van solo a anvil).
   - Levantar anvil sin limitarlo y abrir `/api/fondo` antes de empezar: con el fork en frío, la primera escritura sobre un cheque nuevo puede tardar más de 16 s (anvil trae el estado de Infura) y la API corta con 502 `RED_BLOCKCHAIN`. Es propio del fork: contra Infura la misma simulación tarda ~200 ms.
4. Comparar antes y después, contra Base Sepolia real, los nonces de las 6 wallets y `totalAssets`: tienen que coincidir.

Resultado del ensayo del 3-11-2026, con 4 claves:
- MercadoLibre de 10M: se adelantan 9.571.616,44.
- El segundo MercadoLibre, de 4M, lo rechaza el contrato: 13,44M contra un tope de 12M.
- Aporte de 1M: el fondo pasa a 31M.
- Coto pagado: la cuotaparte sube a 1,0031 y la TIR a +26,63 %.
- Cencosud rebota: la cuotaparte cae a 0,7808, con una pérdida de 6.891.563,84 y la TIR en −454,58 %.
- KYC: 503.
