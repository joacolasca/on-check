# Evidencia onchain — transacción con ARGt real (track Twin)

Requisito del track Twin: "al menos un hash de transacción ejecutada por tu producto, verificable en el explorer", con una Twin Stablecoin en una chain elegible.

| Dato | Valor |
|---|---|
| Hash | [`0xd2d1a142027dd4ebdbadac7aefe833c24bc790c4a28bd9443e4fea21128429a9`](https://arbiscan.io/tx/0xd2d1a142027dd4ebdbadac7aefe833c24bc790c4a28bd9443e4fea21128429a9) |
| Chain | Arbitrum One (42161), elegible según el PDF del track |
| Token | ARGt (Twin) `0x59863989d080B22476DB95656d0C3CC18be92214`; Arbiscan lo etiqueta "Twin: ARGt Token" |
| Operación | `transfer` de **10 ARGt** + referencia del cheque agregada al final del calldata |
| De → a | `0x491E41EaAe8478Fb1311fA2afDc4842D35057008` (MetaMask del equipo) → `0x8E46fa5857700A87c8d4718A6CCe07De1fA26424` (wallet que cobra, del equipo) |
| Referencia | `CH-DEMO-001` → `keccak256("hackatwin:cheque:CH-DEMO-001")` = `0xc978aa5f328855928b8a7877e27868005e1333dd426341f6d6c21a2bfa41bd28` (verificado: el input de la tx termina con este hash) |
| Bloque | 522122556 · estado **Success** |
| Fecha | 7-11-2026 15:44:33 UTC (12:44 Buenos Aires) |
| Fee | 0,0000014 ETH (≈ US$0,003, según Arbiscan) |

## Cómo la ejecutó el producto
La pantalla `/argt-real` de la app (`src/components/PagoArgtReal.tsx`, lógica pura en `src/lib/argt-real.ts` con tests) conecta MetaMask (EIP-6963), arma el `transfer` con la referencia del cheque, lo envía y espera el recibo en Arbitrum. El usuario solo firma en su wallet. Tope de la demo: 200 ARGt.

## Capturas
1. `01-app-antes-de-pagar.jpg`: la app conectada (MetaMask, saldo 1.601,65 ARGt) con el pago cargado.
2. `02-app-comprobante.jpg`: la app después de pagar (saldo 1.591,65 ARGt, hash, referencia y bloque).
3. `03-arbiscan-tx.jpg`: Arbiscan con Success, Transfer 10 ARGt y el contrato "Twin: ARGt Token".

## Honestidad
- Es la única operación del prototipo en mainnet. Fue autorizada explícitamente por el equipo, con plata propia y un monto chico. El resto sigue en Base Sepolia.
- ARGt es un medio de pago: no rinde ni promete rendimiento.
