# Guion de la demo v2 (~3 min de pitch + 3 min de demo)

> Actualizado el 6-11-2026 para la v2 (fondo de cheques **y pagarés**, gestor PM, garantías). Los números de partida salen de un ensayo real en Base Sepolia con los contratos v2. Cifras con ⚠️ vienen del deck de Facu: verificarlas antes de decirlas. Hay video de respaldo por si falla algo en vivo.

## Qué es (para decir en una frase)
Un fondo de cheques y pagarés **no avalados** de pymes. Cada activo es un registro público (y un token) en Base. Un **agente gestor** analiza al emisor con datos del BCRA, estima su industria, lee su balance, mira la tasa de mercado (MAV, simulado en la demo) y analiza la garantía que ofrece el vendedor. Las reglas duras las hace cumplir el contrato.

## Pitch (Facu)
1. **Gancho (15 s):** "En Argentina se mueven $24 billones por mes en cheques electrónicos ⚠️. Una pyme que le vende a una gran empresa cobra a 90 días; si nadie le descuenta el cheque, paga 60 % en una cueva."
2. **Problema (30 s):** el segmento no avalado queda afuera: nadie lo mira con criterio. Y el ahorrista no ve en qué activos está.
3. **Insight (15 s):** "La SGR mira al que vende. Nosotros miramos al que paga, y al activo que respalda."
4. **Solución (30 s):** el fondo + el gestor + las garantías prendarias. Se entra y se cobra en ARGt. *(Decir "agente" o "gestor", nunca "IA". Nunca "ARGt rinde".)*

## Reglas del fondo (se muestran en el panel)
10 % máximo por emisor · 25 % máximo por industria · 15 % de liquidez mínima (cuenta remunerada, **simulada**) · comisión 3 % anual devengada día a día · cuotapartes desde $1.000 · rescate a 24 horas hábiles si se pide antes de las 15 hs · **objetivo 40 % TNA (objetivo, no garantizado)**.

## Antes de empezar (una sola vez)
Desplegar los contratos (`contracts/script/Deploy.s.sol`), cargar las variables en Vercel y correr `DEMO_CLAVE=… pnpm demo:preparar <URL>`. Deja el fondo en **$100.000.000** (Inversor 1 $70 M, Inversor 2 $30 M, ambos con KYC) con cinco activos:

| Activo | Emisor | Tipo | Nominal | Plazo | Estado | Para qué sirve |
|---|---|---|---|---|---|---|
| 1 | Coto | cheque | $6.000.000 | 30 d | Fondeado | Se paga en vivo |
| 2 | Cencosud | cheque | $5.000.000 | 60 d | Fondeado | Rebota (simulado) |
| 3 | Pampa Energía | **pagaré** con garantía: turbina eólica | $8.000.000 | 90 d | Fondeado | Garantía de energía |
| 4 | Loma Negra | **pagaré** con garantía: camión | $6.000.000 | 60 d | Fondeado | Garantía de vehículo |
| 5 | Telecom | cheque | $3.000.000 | 90 d | Pendiente | Antecedente antiguo |

Quedan: liquidez ≈ 76 %, mayor emisor ≈ 7,5 % (tope 10 %), mayor industria ≈ 10,7 % (tope 25 %). Los dos cheques de MercadoLibre se cargan en vivo.

## Demo (Joaquín o Rama)
1. **Panel (≈30 s):** patrimonio $100 M, cuotaparte $1.000, liquidez 76 % vs. mínimo 15 %, comisión devengada. Las tortas: **por emisor, por industria, cheques vs. pagarés**. "Ves en qué está cada peso, y las reglas con cuánto se consumen."
2. **Pyme + gestor (≈60 s):** cargar un **cheque de MercadoLibre S.R.L.** (CUIT `30-70308853-4`) por **$9.000.000 a 60 días**. Se ve al agente trabajar en vivo: política del fondo, Central de Deudores del BCRA, MAV (simulado), industria, cartera. Resultado ensayado: **puntaje 95, banda A**, TNA 26,06 %, adelanto ≈ **$8.608.029** (varía con la fecha). Decisión del gestor y condiciones. Aceptar → **Pending → Funded**; el activo queda tokenizado.
3. **El contrato dice que no (≈30 s):** cargar un **segundo cheque de MercadoLibre de $4.000.000 a 45 días**. El contrato lo rechaza: llevaría al emisor a ≈ 12,5 % del patrimonio y el tope es 10 %. "El gestor propone, el contrato dispone."
4. **Garantía (≈40 s, solo cotización):** en `/pyme` elegir **pagaré** y cargar una garantía (por ejemplo una camioneta o una turbina, con valor declarado y documentos). Se ve el descuento, el valor ajustado, la cobertura, la liquidez, los riesgos y los documentos que faltan. "La prenda legal se firma después: acá se analiza si vale la pena."
5. **Inversor y rescate (≈30 s):** en `/invertir`, suscribir 1.000 cuotapartes como mínimo (≈ $1.000.000 al valor de hoy) y ver las cuotapartes (valor de $1.000 al inicio). Pedir un rescate: se explica el plazo (24 horas hábiles, corte 15 hs). En `/demo`, "El gestor liquida los rescates" (con el modo demo, sin esperar) y se ve la explicación sobre la liquidez.
6. **Adelantamos el tiempo (≈30 s):** en `/demo`, **Coto se paga** (sube el valor de la cuotaparte) y **Cencosud rebota** (la pérdida queda pública). **Aclarar en voz alta que el rebote es simulado.** Un solo rebote sobre un plazo corto da una TIR extrema (en el ensayo, −367 %): lo importante es que es público.

## Aclaraciones que hay que decir en voz alta
- Todo es testnet: sin dinero real. El ARGt de la demo es simulado.
- El **MAV está simulado** ("MAV (simulado)" en pantalla). La **industria la estima el agente** (con fundamento y fuentes). Los **descuentos por tipo de garantía** los definió y confirmó Facu.
- La liquidez mínima representa una cuenta remunerada o money market: simulada.
- Rescate: los días hábiles no consideran feriados (por ahora).

## Preguntas probables del jurado
- **¿De dónde salen los datos?** Central de Deudores del BCRA (API pública), balances que sube el emisor y, para tasas de mercado, el MAV (hoy simulado). Si el BCRA falla, se usa la última copia guardada.
- **¿El agente decide solo?** No: propone y explica. Las reglas duras (10 % emisor, 25 % industria, 15 % liquidez, KYC) las hace cumplir el contrato.
- **¿Y si el agente falla?** Cae al análisis determinístico y la cotización sale igual.
- **¿Privacidad?** El CUIT nunca va en claro onchain: `keccak256(cuit ‖ salt)`.
- **¿Cómo se verifica la explicación?** Cada cotización tiene un hash registrado en Base, y la garantía también.
- **¿Es dinero real?** No: prototipo en testnet (Base Sepolia).
- **¿Y lo legal?** "Pagás y cobrás en ARGt; el instrumento es el cheque o el pagaré." Camino: sandbox de la CNV, vehículo regulado y socio licenciado. La prenda se instrumenta legalmente con cada vendedor.

## Cierre (Facu, 30 s)
- Modelo de negocio: comisión 3 % anual sobre el patrimonio.
- Camino legal: sandbox de la CNV, vehículo regulado y socio licenciado.
- El ask: Twin (ARGt como medio de pago), Belo (canal minorista con KYC).
- "No inventamos un instrumento: hacemos visible, programable y respaldado el que ya funciona."

## Pendiente
- "Se negocia a mínimo 1.000 cuotapartes y de a 1": resuelto (7-11-2026): suscripción mínima de 1.000 cuotapartes enteras; los rescates no tienen mínimo.
- Feriados en el plazo de rescate: no se consideran (decisión de Facu, 7-11-2026).
- Fuente real para el MAV (hoy simulado).
