# Cronología del proyecto

Cómo se construyó On-Chain, en orden. Este repositorio nació el 7 de noviembre de 2026 como una importación en un solo commit del trabajo del equipo, que se desarrolló antes en un repositorio privado (el proyecto empezó el 2 de noviembre de 2026). Acá no se conserva ese historial, pero el trabajo previo está documentado.

| Fecha | Qué se hizo |
|---|---|
| 2 al 4 de noviembre de 2026 | Primera versión: fondo de cheques electrónicos (`ChequeFund` v1), capa chain y API, scoring con la Central de Deudores del BCRA, agente analista y pantallas base. Probado en Base Sepolia. |
| 6 de noviembre de 2026 | Versión 2, a pedido de finanzas: pagarés con garantías prendarias, reglas del fondo en el contrato (10 % por emisor, 25 % por industria, 15 % de liquidez), cuotapartes, comisión y rescates, y un token por activo. |
| 7 de noviembre de 2026 (día del evento) | El **Mandato** (el agente que invierte con las reglas del inversor), el detalle de cada activo, los límites del fondo controlados también por el servidor, la evidencia onchain (pago con ARGt real en Arbitrum, fondo en Avalanche Fuji), el pitch y el despliegue final. |

## Sobre lo simulado

El MAV, el rebote de un emisor y la liquidez en cuenta remunerada son simulados en la demo. Todo corre en testnet salvo el pago de 10 ARGt en Arbitrum One ([evidencia](evidencia-onchain/README.md)).
