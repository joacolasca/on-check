# Why Avalanche

Por qué el fondo de cheques tiene sentido en Avalanche (requisito 3 del track Blockchain).

1. **La moneda del fondo ya está ahí.** ARGt, el peso tokenizado de Twin, circula en Avalanche C-Chain (`0x2E4e93eCA2E16E4989b894e188B7F7fC0175703B`, verificado en Snowtrace). El fondo compra cheques y paga en pesos onchain sin cambiar de red.
2. **Finality en segundos.** Cuando el fondo compra un cheque, la pyme cobra en la misma operación (`fondearCheque` transfiere el precio en el mismo bloque). Una finality casi inmediata es lo que hace creíble un "adelanto de cheque" que hoy tarda días.
3. **Costo por operación bajo.** Cada cheque implica pocas transacciones (registrar, fondear, cobrar o rechazar). Un costo bajo de gas permite comprar cheques chicos de pymes, que es justo el segmento que el sistema tradicional atiende mal.
4. **Compliance como parte del protocolo.** El contrato ya exige KYC para invertir y limita la exposición por librador. En Avalanche ese control puede venir de attestations onchain (por ejemplo KUMPLY: KYC del inversor, KYB de la pyme y KYA del agente que origina), sin listas manuales.
5. **Camino institucional.** Si un fondo regulado lo adopta, puede pasar a una L1 propia con validadores permisionados y reglas de compliance a nivel de red, sin reescribir los contratos (mismo EVM). [Roadmap, no implementado.]

## Qué hay hoy y qué no
- **Hoy:** ChequeFund y MockARGt desplegados y verificados en Fuji, y la UI `/avalanche` operándolos ([evidencia](evidencia-onchain/avalanche/README.md)).
- **No implementado:** KUMPLY, 0xGasless y una L1 propia. El fondo de Fuji usa mARGt de testnet, no ARGt real.
