# Evidencia onchain: Avalanche (track Blockchain)

Requisito 1 del track: "Deploy at least one smart contract in the Avalanche ecosystem, on testnet (Fuji) or mainnet. The contract must be verified on the corresponding explorer."

## Contratos desplegados en Avalanche Fuji C-Chain (43113)
| Contrato | Dirección | Snowtrace |
|---|---|---|
| **ChequeFund** (fondo ERC-4626 con KYC y tope por librador) | `0xaCB72e4B9d31DA54BD1830Df3022BA41F42afc56` | [código verificado](https://testnet.snowtrace.io/address/0xaCB72e4B9d31DA54BD1830Df3022BA41F42afc56/contract/43113/code) |
| **MockARGt** (ARGt de testnet, mARGt) | `0x026f24BF9Ea99302E1CBadFC8D384EF405Beaf58` | [código verificado](https://testnet.snowtrace.io/address/0x026f24BF9Ea99302E1CBadFC8D384EF405Beaf58/contract/43113/code) |

- **Desplegados:** 7-11-2026, MockARGt a las 15:57:45 UTC y ChequeFund a las 16:07:21 UTC. Admin y creador: `0x491E41EaAe8478Fb1311fA2afDc4842D35057008` (MetaMask del equipo).
- **Mismo código** que `contracts/src/` (el que corre en Base Sepolia). Se compiló con solc 0.8.28, optimizador de 200 runs, EVM cancun y OpenZeppelin 5.6.1.
- **Constructor de ChequeFund:** `argt` = MockARGt de Fuji y `admin` = la cuenta de arriba. Lo comprobamos leyendo la cadena: `asset()` devuelve MockARGt y `symbol()` devuelve `cCHQ`.
- **Verificación:** la hicimos por la API de Routescan, el backend de Snowtrace, con el código aplanado; las dos respuestas fueron `Pass - Verified`. Snowtrace la marca como "Partial Match" porque el código aplanado cambia el hash de metadatos, no la lógica.
  - **ChequeFund** figura con su nombre y nuestro código.
  - **MockARGt** figura con un "MockERC20" de otra persona que Snowtrace ya tenía con bytecode equivalente: es un ERC-20 con `mint` abierto, igual al nuestro.

## UI integrada (requisito 2)
La pantalla `/avalanche` de la app (`src/components/AvalancheFuji.tsx`) se conecta con MetaMask a Fuji y opera el fondo: KYC, rol de originador, mARGt, inversión, registro y compra de un cheque. También lee el **ARGt real de Twin en Avalanche C-Chain** (`0x2E4e93eCA2E16E4989b894e188B7F7fC0175703B`, solo lectura).

## Capturas (para la presentación)
1. `01-remix-deploy-fuji.jpg`: el deploy de ChequeFund confirmado en Fuji (Remix + MetaMask).
2. `02-snowtrace-chequefund-verificado.jpg`: Snowtrace con ChequeFund verificado (compilador, optimizador, cancun y creador).
3. `03-snowtrace-mockargt-verificado.jpg`: Snowtrace con MockARGt verificado.

Las capturas de la operación desde la app se agregan como `04-…` en adelante.
