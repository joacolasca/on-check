# Guion de la demo para el track de Belo (consigna #4: el agente que maneja tu plata con reglas del usuario)

> 7-11-2026. Cifras de una corrida real contra contratos v2 en Base Sepolia (98 s). Cifras con ⚠️ vienen del deck de Facu y hay que verificarlas antes de decirlas. Es el guion principal; `docs/DEMO-SCRIPT.md` queda como respaldo (demo manual de la v2).

## La idea en una frase
"Fijás tus reglas una vez y tocás un solo botón. El agente invierte tu plata en cheques y pagarés de pymes, explica cada movimiento, y lo que se pasa de tus reglas o de las del fondo no se puede hacer: lo frena el servidor y, antes que él, el contrato."

## Criterios de Belo y dónde se ve cada uno
| Criterio (peso) | Dónde se ve en la demo |
|---|---|
| Problema real de LatAm (30 %) | La pyme que cobra a 60–90 días y paga ~60 % anual en el mercado informal ⚠️; el ahorrista que no ve en qué está. |
| Funciona de punta a punta (25 %) | Una corrida real en Base Sepolia, con transacciones y links a BaseScan. Sin slides en el medio. |
| Se puede llevar a producto (25 %) | Reglas duras en el contrato (10 % emisor, 25 % industria, 15 % liquidez, KYC); mandato revocable; camino regulatorio (sandbox CNV, vehículo regulado, socio licenciado); "no es asesoramiento". |
| Uso de IA que no decora (20 %) | El gestor analiza el BCRA, el balance, la industria y la garantía, y explica en castellano; pero las reglas las hace cumplir código fijo, no el modelo. |

## Demo (3 min)
1. **Problema (15 s).** "Una pyme le vende a una gran empresa y cobra a 90 días. Si nadie le descuenta el cheque, paga 60 % en una cueva ⚠️. Y el ahorrista nunca ve en qué está su plata."
2. **Tus reglas (15 s).** En `/mandato`: presupuesto $40 M, banda B o mejor, tope 35 % por emisor, hasta 90 días, cobertura mínima de garantía 100 %. "Las fijo una vez." Tocar **Iniciar mandato**. Manos fuera del teclado.
3. **La corrida (≈100 s, se narra mientras pasa).**
   - **MercadoLibre** ($9 M, banda A, puntaje 95): el agente consulta el BCRA, mira el MAV (simulado), estima la industria y compra. "Cumple 11 de 11 reglas de mi mandato."
   - **MercadoLibre de nuevo** ($4 M): "Mi mandato lo permitía. Pero el contrato del fondo no deja pasar de 10 % del patrimonio a un solo emisor: lo rechaza, el agente lo anota y sigue." (Se lee el motivo en castellano en pantalla.)
   - **Pagarés con garantía** (Pampa con turbina eólica, Loma Negra con camión): "La garantía se analiza: descuento por liquidez, cobertura, documentos que faltan. La prenda legal se firma después."
   - **Fuera de mandato:** un pagaré cuya garantía cubre solo 75,83 % y yo pedí 100 %: "El agente lo omite y me dice por qué."
4. **El rebote (30 s).** Cencosud rebota (**simulado por el oráculo de la demo; decirlo en voz alta**). "El agente lo detecta solo, deja de comprarle a ese emisor, registra la pérdida ($4,8 M) y la cuotaparte baja de $1.000 a $952. La pérdida es pública."
5. **Informe y CUIT sorpresa (25 s).** El informe: antes/después, qué compró, qué omitió, qué rechazó el contrato, links a BaseScan. "Elijan un CUIT": escribir el que diga un jurado, el agente lo analiza en vivo con las reglas del mandato.
6. **Cierre (15 s).** "Belo pone al agente a proponer y a la persona a aprobar cada movimiento, y tiene 'elegir permisos del agente' como próximo paso. Esto es ese paso: aprobás las reglas una vez, podés pausar o revocar cuando quieras, y el contrato garantiza que el agente no se pasa. Pagás y cobrás en ARGt; el instrumento es el cheque y el pagaré."

## Qué se dice en voz alta (honestidad)
- Todo es testnet (Base Sepolia): sin dinero real; el ARGt de la demo es simulado.
- El **MAV está simulado**; la **industria** la estima el agente (con fundamento); el **rebote** es simulado; los descuentos de garantía los definió y confirmó Facu.
- La liquidez mínima del 15 % representa una cuenta remunerada: simulada.
- No es asesoramiento financiero. Nunca "rinde" ni "rendimiento garantizado": el 40 % es un **objetivo**, no una promesa.
- Sobre la palabra IA: en el pitch hablado se puede decir "agente de IA" (Belo puntúa el uso de IA); en las pantallas se dice "agente" o "gestor".

## Preguntas probables
- **¿El agente decide solo?** Dentro de tus reglas, sí; fuera de ellas, no puede. Las reglas las hace cumplir el servidor con código fijo y el contrato con las del fondo. Y podés pausar, revocar, o pedir tu aprobación por encima de un monto.
- **¿Y si el modelo se equivoca?** No puede comprar lo que las reglas rechazan: el modelo propone y explica, no decide. Si el modelo falla, el análisis cae a uno determinístico.
- **¿De dónde salen los datos?** Central de Deudores del BCRA (API pública), balances que sube el emisor y MAV (simulado). Si el BCRA falla, se usa la última copia guardada.
- **¿Qué pasa con la privacidad?** El CUIT nunca va en claro onchain: `keccak256(cuit ‖ salt)`.
- **¿Cómo llega a producción con Belo?** Mismo patrón que su banca agéntica: permisos persistentes con límites; KYC de Belo; el fondo como vehículo regulado.
- **¿Por qué onchain?** Cada activo es un registro público y un token; la regla del 10 % o la liquidez no dependen de que confíen en nosotros.

## Antes de presentar (checklist)
1. Copia final con contratos nuevos y solo el pool: `pnpm demo:preparar <URL> --solo-pool` (**la corrida del mandato gasta el estado: es de un solo uso**; para repetirla hay que desplegar contratos nuevos y volver a cargar el pool, unos 10 minutos).
2. Entrar una vez a `/api/demo/acceso` con la clave de la demo para tener la sesión.
3. Ensayar en la copia de ensayo, no en la final. Tener el video de respaldo.
4. Wallets con gas: originador, oráculo e inversores. Infura sin saturar (hay RPC de respaldo).
5. Qué hacer si falla algo en vivo: pausar el mandato, seguir con lo ya comprado; si cae el análisis, el determinístico responde igual; si cae todo, el video.

## Pendiente de confirmar
- Que se pueda competir en el track con trabajo empezado antes del evento (issue #30), y si se puede presentar a más de un track.
