# SPEC — Fondo de cheques transparente onchain

> Fuente: audio y deck de Facu (`Fondo_Cheques_Onchain_v2.pdf`, 39 slides, relevado 31-10-26).
> Este archivo reemplaza al PDF para Claude Code: **no le pasen el PDF**, lean esto.
> Las cifras con ⚠️ salen del deck: hay que verificarlas antes de ponerlas en el pitch.

## Evento

- **HackaTwin**, sábado 7 de noviembre de 2026, Digital House (Monroe 860, CABA). Organiza Twin Finance.
- Build de 12 h: 9:00 kickoff · **18:00 entrega** · 19:00 demo day.
- Hay workshops durante la semana previa.
- Se elige **un solo track**: AI, Blockchain o Fintech. Vamos a **Fintech** (ver DECISIONS.md).
- Sponsors: Twin, Digital House, Belo, Tether, Team1 Avalanche. Partners: Vercel, Firecrawl, Plugin, Paisanos.
- No hay criterios de evaluación ni jurado publicados.

## El problema, simple

1. Las empresas grandes (Farmacity, Mercado Libre, etc.) les pagan a sus proveedores pyme con **cheques electrónicos (ECHEQ) a 30, 60, 90 o más días**.
2. La pyme ya gastó en la mercadería y necesita la plata hoy. Entonces **"descuenta" el cheque**: lo vende hoy por menos de su valor. Un cheque de $10M a 60 días al 30% anual se vende por ~$9,5M.
3. Para descontar en el mercado formal (el MAV) casi siempre hace falta que una **SGR** avale el cheque. Las SGR analizan a la pyme con criterios bancarios (antigüedad, balances) y **dejan afuera a pymes nuevas y a personas sin sociedad**.
4. Los que quedan afuera van al mercado paralelo ("cuevas"), que les cobra **~60% anual**.
5. Del lado del ahorrista, los fondos de cheques (FCI PyME) existen, pero muestran la cartera **una vez por mes, agregada, en un PDF**. El inversor no sabe en qué cheques está.

## La idea central (la frase del pitch)

> **La SGR mira al que vende el cheque. Nosotros miramos al que lo paga.**

El riesgo real de un cheque es el **librador**, o sea quien lo emitió y lo va a pagar (por ejemplo Farmacity), y no la pyme que lo endosa. Una pyme de 2 años con un cheque de una empresa sólida tiene poco riesgo real, y hoy nadie se lo descuenta a buena tasa.
⚠️ Confirmar con Facu (DECISIONS.md, Supuestos S1).

## La solución

Un **fondo de cheques donde cada cheque es un registro público onchain**:

- **Visible:** cada ECHEQ (monto, vencimiento, puntaje, estado) queda en Base. Hay un panel público con la cartera, la concentración, los cobros, los rechazos y la TIR, con link a BaseScan.
- **Explicado:** consultamos la Central de Deudores del BCRA (API pública), calculamos un puntaje del librador y explicamos en castellano por qué ese cheque paga esa tasa.
- **Programable:** el inversor entra y cobra en **ARGt**, el peso tokenizado 1:1 de Twin. El contrato hace cumplir las reglas del fondo (por ejemplo, un máximo por librador).
- **Analizado por un agente propio (parte central, obligatoria):** un agente que analiza la calidad crediticia de cada cheque con un sistema de scoring propio, y muestra su razonamiento. Facu lo confirmó el 2-11-2026 (ver DECISIONS.md, D17). El scoring determinístico es la herramienta que el agente usa.
- **Transparente también cuando sale mal:** si un cheque rebota, la pérdida se ve en público.

**Para la pyme:** cobra en el día y paga menos si su cliente es bueno.
**Para el ahorrista:** ve exactamente qué cheques tiene y qué riesgo corre.
**Para Twin y Belo:** un caso de uso de ARGt como medio de pago, y un producto nuevo para su base de usuarios.

## ⚠️ Regla legal del pitch (no negociable)

- El 11-03-26 la CNV intimó a Belo y a Twin por promocionar "ARGt que rinde 32% TNA" (lo trató como valor negociable). Después levantó la medida cuando sacaron toda referencia a rendimiento. ⚠️ (deck, slides 7 y 32)
- **Nunca decir ni escribir "ARGt rinde" ni "rendimiento garantizado".** Decir: *"pagás y cobrás en ARGt; el instrumento es el cheque"*.
- Todo es un **prototipo en testnet, sin dinero real, no es oferta pública**. Ponerlo en el footer de la app.
- En producción el vehículo sería un FCI cerrado o un fideicomiso financiero tokenizado, bajo el sandbox de tokenización de la CNV (RG 1150/2026, vigente hasta 31-12-2027 ⚠️), con un socio licenciado (sociedad gerente o fiduciario, ALyC/PSAV como Belo, custodia en Caja de Valores).

## Ciclo de vida de un cheque (lo que la demo muestra)

```
01 PENDING   La pyme carga el ECHEQ → consultamos al BCRA → puntaje + tasa + explicación → se registra onchain
02 FUNDED    El fondo compra el cheque con la liquidez que pusieron los inversores (en ARGt) → la pyme recibe el adelanto
03a PAID     Al vencimiento el librador paga → el oráculo lo marca → el fondo gana la diferencia
03b REJECTED El cheque rebota → el oráculo lo marca → la pérdida queda pública
```

En la demo, un botón **"adelantar tiempo"** marca pagado o rechazado.

## Números de contexto (todos ⚠️, del deck)

| Dato | Valor | Fuente citada en el deck |
|---|---|---|
| ECHEQ compensados por mes | $24 billones (ago-26), 87,2% del monto de cheques | BCRA, Informe de Pagos Minoristas ago-26 |
| Tasa de descuento sin garantía (MAV) | 30,33% TNA (sep-26) | Método Crítico / Cohen |
| Tasa de cheque avalado SGR | 25,98% TNA | ídem |
| TAMAR | 23–24,5% | ídem |
| Cartera de todos los fondos PyME | $2,16 billones (63 fondos, 28-10-26) | CAFCI |
| Cheques rechazados por falta de fondos | 1,0% del monto (ago-26) | BCRA |

Mensaje: *hay 10 veces más papel por mes que capital de fondos PyME para comprarlo.*

## Modelo de negocio (supuestos, ⚠️ confirmar con Facu)

- Comisión de originación: 0,5% del nominal, la paga la pyme.
- Honorario de administración: 2% anual sobre lo adelantado.
- Total ≈ 0,8% por cheque de 60 días.
- Ingresos futuros: el "oráculo de transparencia" como SaaS para FCI PyME existentes, y el puntaje de libradores por API.

## Competencia (resumen)

FCI PyME (Fima, Valiant, First Renta) no tienen detalle por cheque ni están onchain. Mercado Cheque es B2B y no es verificable. Liqi (Brasil) hace algo parecido pero no está en Argentina. Goldfinch y Credix (crédito onchain sin vehículo regulado) fracasaron o pivotaron. La lección es **primero el vehículo regulado, después el token**.

## Fuera de alcance para el sábado

- Garantías reales (autos, propiedades) que mencionó Facu en el audio.
- Integración real con Belo, BitGo, Caja de Valores o COELSA (van como roadmap en el pitch).
- Serie en USDT (roadmap).

## Confidencialidad

El caso real de Facu (una distribuidora de farmacias que mueve ~$500M/mes en cheques) se usa **anonimizado**. Nunca se usan CUITs ni nombres de clientes de Facu en el código, en los datos ni en el pitch.
