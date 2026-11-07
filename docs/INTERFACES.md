# Interfaces (los "enchufes" entre módulos)

> Esto es el contrato entre los 3 devs. **Nadie cambia una interfaz sin avisar en el grupo y actualizar este archivo en el mismo PR.**
> Los tipos TypeScript viven en `src/shared/types.ts` y tienen que coincidir con este archivo.

## Módulos y dueños

| Módulo | Carpeta | Dueño | Suplente |
|---|---|---|---|
| Contratos | `contracts/` | Rama | Joaquín |
| Capa chain + API | `src/lib/chain/`, `src/app/api/` | Rama | Joaquín |
| Scoring + cotización | `src/lib/scoring/` | Nacho | Joaquín |
| Web (UI) | `src/app/(ui)/`, `src/components/` | Joaquín | Rama |
| Compartido | `src/shared/`, `shared/fixtures/` | todos (avisar antes) | — |

---

## Enchufe 1 — Contrato `ChequeFund` (Solidity)

```solidity
// ERC-4626 sobre MockARGt + AccessControl
enum Estado { None, Pending, Funded, Paid, Rejected }

struct Cheque {
    bytes32 libradorHash;   // keccak256(cuit ‖ salt)
    address pyme;           // quien recibe el adelanto
    uint256 nominal;        // ARGt, 18 decimales
    uint256 precioCompra;   // lo que se adelanta a la pyme
    uint64  vencimiento;    // unix timestamp
    uint8   puntaje;        // 0–100
    uint16  tasaBps;        // TNA en basis points (2800 = 28%)
    bytes32 cotizacionHash; // keccak256 del JSON de la cotización
    Estado  estado;
}

// Roles: DEFAULT_ADMIN_ROLE, ORIGINADOR_ROLE (backend), ORACULO_ROLE (backend en la demo)

function registrarCheque(bytes32 id, Cheque calldata datos) external;  // ORIGINADOR · estado → Pending
function fondearCheque(bytes32 id) external;                          // ORIGINADOR · Pending → Funded
    // transfiere precioCompra a la pyme con la liquidez del pool
    // REVIERTE si (exposicion[libradorHash] + precioCompra) * 10000 > maxConcentracionBps * totalAssets()
function marcarPagado(bytes32 id) external;     // ORACULO · Funded → Paid · el oráculo transfiere `nominal` al fondo
function marcarRechazado(bytes32 id) external;  // ORACULO · Funded → Rejected · pérdida = precioCompra
function setKyc(address cuenta, bool ok) external;        // ADMIN
function setMaxConcentracionBps(uint16 bps) external;     // ADMIN · default 4000 (40%)

function cheques(bytes32 id) external view returns (Cheque memory);
function exposicion(bytes32 libradorHash) external view returns (uint256);

// ERC-4626: deposit / mint / withdraw / redeem SOLO para direcciones con KYC
// totalAssets() = saldo ARGt del fondo + suma de precioCompra de los cheques Funded

event ChequeRegistrado(bytes32 indexed id, bytes32 indexed libradorHash, address pyme, uint256 nominal, uint256 precioCompra, uint64 vencimiento, uint8 puntaje, uint16 tasaBps, bytes32 cotizacionHash);
event ChequeFondeado(bytes32 indexed id, uint256 precioCompra);
event ChequePagado(bytes32 indexed id, uint256 nominal);
event ChequeRechazado(bytes32 indexed id, uint256 perdida);
event KycActualizado(address indexed cuenta, bool ok);
```

`MockARGt`: ERC-20 "ARGt (testnet mock)", símbolo `mARGt`, 18 decimales, `mint(address,uint256)` abierto (es un faucet de testnet).

**Día 1:** el ABI se publica en `src/shared/abi/` con el esqueleto (funciones vacías), para que los demás puedan programar contra él. Rama lo mantiene actualizado.

---

## Enchufe 2 — Scoring (Nacho → API)

```ts
// src/lib/scoring/index.ts
export async function scoreLibrador(cuit: string, opts?: { modo?: 'live' | 'cache' | 'auto' }): Promise<ResultadoScoring>;
export function cotizar(input: InputCotizacion, scoring: ResultadoScoring, config: ConfigFondo): Cotizacion;

type Banda = 'A' | 'B' | 'C' | 'D';

interface ResultadoScoring {
  cuit: string;
  denominacion: string | null;        // nombre que devuelve el BCRA, si lo hay
  puntaje: number;                    // 0–100, arranca en 100
  banda: Banda;
  situacionPeor: number;              // 1 = normal … 5/6 = irrecuperable
  chequesRechazadosImpagos: number;   // últimos 12 meses
  refinanciaciones: boolean;
  deudaCreciente: boolean;
  ajustes: { motivo: string; puntos: number }[];  // ej. { motivo: 'Situación 2 en una entidad', puntos: -15 }
  fuente: 'bcra-live' | 'bcra-cache';
  consultadoEn: string;               // ISO
}

interface InputCotizacion {
  cuit: string;           // del librador
  nominal: string;        // en pesos, string decimal ("10000000")
  vencimiento: string;    // ISO date
  pyme: string;           // address de la pyme (wallet de demo)
}

interface ConfigFondo {
  tamarTnaBps: number;              // ⚠️ valor con fecha y fuente, en config
  spreadPorBandaBps: Record<Banda, number | null>;  // null = no se compra
  plazoMaxDias: number;
  nominalMin: string;
  nominalMax: string;
}

interface Cotizacion {
  id: string;                 // bytes32 hex, determinístico
  libradorHash: string;       // bytes32 hex
  input: InputCotizacion;
  scoring: ResultadoScoring;
  dias: number;
  tasaTnaBps: number;
  descuento: string;          // pesos
  precioCompra: string;       // pesos
  aprobada: boolean;
  motivoRechazo: string | null;
  explicacion: string;        // castellano, 2–3 oraciones, sin la palabra "rinde"
  cotizacionHash: string;     // keccak256 del JSON canónico de la cotización (sin este campo)
}
```

**Reglas de puntaje (deck, slide 21; ⚠️ Facu confirma):**
- Arranca en 100.
- −15 por cada nivel de situación BCRA peor que 1 (se toma la peor entidad).
- −25 si hay cheques rechazados impagos en los últimos 12 meses.
- −10 si hay refinanciaciones.
- −5 si la deuda creció según el histórico.
- Bandas: A ≥ 85 (+2 pp sobre TAMAR) · B 70–84 (+4 pp) · C 55–69 (+7 pp) · D < 55 (no se compra).

**API del BCRA** (pública, sin clave): base `https://api.bcra.gob.ar/centraldedeudores/v1.0`
- `GET /Deudas/{cuit}`
- `GET /Deudas/Historicas/{cuit}`
- `GET /Deudas/ChequesRechazados/{cuit}` (404 = sin rechazos)

Timeout de 3 s y fallback a `shared/fixtures/bcra/{cuit}.json`.

**Día 1:** Nacho deja un `scoreLibrador` mock que devuelve datos fijos, para que la API no lo espere.

---

## Enchufe 3 — API HTTP (Rama → Web)

Todas las respuestas son JSON. Error: `{ error: { codigo: string, mensaje: string } }`.

| Método y ruta | Body | Respuesta |
|---|---|---|
| `POST /api/cotizar` | `InputCotizacion` (con `pyme` **opcional**: la pone el servidor) | `Cotizacion` |
| `POST /api/agente/analizar` | igual que `/api/cotizar` | `ResultadoAgente` (`{ cotizacion, pasos, alertas, modo }`). Con la cabecera `accept: application/x-ndjson` transmite un evento por línea (`paso`, `reinicio`, `resultado`, `error`: ver `src/lib/agent/stream.ts`). **Es el que usa `/pyme`.** |
| `POST /api/cheques` | `{ cotizacionId, cotizacion? }` (`cotizacion` es un respaldo opcional: se acepta solo si trae una `firma` válida del servidor (`Cotizacion.firma`, opcional, fuera de `cotizacionHash`) y su hash corresponde a su contenido) | `{ chequeId, tx: string }` → registra (Pending) |
| `POST /api/cheques/:id/fondear` | — | `{ tx }` → Funded, o error `CONCENTRACION_EXCEDIDA` / `INDUSTRIA_EXCEDIDA` / `LIQUIDEZ_MINIMA` / `SIN_LIQUIDEZ` |
| `GET /api/fondo` | — | `ResumenFondo` (v2: política, composición, liquidez, comisión, rescates pendientes, `modoDemo`) |
| `GET /api/cheques` | — | `ChequeVista[]` (v2: `tipo`, `industria`, `emisorNombre`, `garantia`) |
| `GET /api/rescates` | — | `RescateVista[]` |
| `POST /api/demo/rescates` | `{ cuenta, cuotapartes }` (string decimal, hasta 6 decimales; firma el inversor) | `{ tx, rescate: RescateVista }` → Pendiente. Error `CUOTAPARTES_INSUFICIENTES` |
| `POST /api/demo/rescates/liquidar` | — | `ResultadoLiquidacion` (el gestor liquida los vencidos o, con `modoDemo`, todos los pendientes) |
| `GET /api/demo/posicion?cuenta=inversor1` | — | `PosicionInversor` |
| `POST /api/demo/modo` | `{ activo: boolean }` (admin del contrato: `setModoDemo`) | `{ tx, modoDemo }` |
| `POST /api/demo/kyc` | `{ cuenta: 'inversor1' \| 'inversor2' }` | `{ tx }` |
| `POST /api/demo/invertir` | `{ cuenta, monto }` | `{ tx, shares }` (mint de mARGt + deposit; `shares` = cuotapartes al valor de cuotaparte del momento, $ 1.000 la primera vez) |
| `POST /api/demo/liquidar` | `{ chequeId, resultado: 'pagado' \| 'rechazado' }` | `{ tx }` ("adelantar tiempo") |
| `GET /api/argt-real` | — | `{ totalSupply, fuente: 'base-mainnet', direccion }` |
| `GET /api/demo/cuentas` | — | `CuentaDemoEstado[]` (saldo de gas y de mARGt y KYC de las wallets de demo) |

**Modo real y modo prueba:** si hay un contrato configurado (`CHEQUE_FUND_ADDRESS` o `shared/deployments/base-sepolia.json`), las rutas leen y escriben la blockchain. Los datos de prueba de `shared/fixtures/api/` se devuelven **solo con `API_MODE=mock`**; sin contrato y sin ese modo, la API responde `503 CONTRATO_NO_CONFIGURADO` (nunca una tx falsa como si fuera real). Los errores del contrato llegan como `CONCENTRACION_EXCEDIDA`, `INDUSTRIA_EXCEDIDA`, `LIQUIDEZ_MINIMA`, `CUOTAPARTES_INSUFICIENTES`, `SIN_LIQUIDEZ`, `SIN_KYC`, `ESTADO_INVALIDO`, `CHEQUE_YA_REGISTRADO`, `CHEQUE_INEXISTENTE`, `COTIZACION_NO_ENCONTRADA`, `COTIZACION_RECHAZADA`, `SIN_GAS` y `RED_BLOCKCHAIN`.

**Acceso a las rutas que firman** (`POST /api/demo/kyc`, `/api/demo/invertir`, `/api/demo/liquidar`, `/api/demo/rescates`, `/api/demo/rescates/liquidar`, `/api/demo/modo`, `/api/cheques`, `/api/cheques/:id/fondear`): exigen la clave de la demo, por header `x-demo-clave` (scripts) o por la cookie `demo_sesion` que deja `GET/POST /api/demo/acceso` (formulario HTML; el navegador la manda solo). Con cookie, el pedido tiene que ser del mismo origen. Todas exigen `content-type: application/json`. Las formas de las respuestas exitosas no cambian.

**Otros códigos de error** (todos con `{ error: { codigo, mensaje } }`):

| Código | Status | Cuándo |
|---|---|---|
| `NO_AUTORIZADO` | 401 / 403 | Falta la clave o la sesión, o la sesión viene de otro origen (403) |
| `DEMASIADAS_SOLICITUDES` | 429 | Se pasó el límite de operaciones por minuto (header `Retry-After`) |
| `CONTRATO_NO_CONFIGURADO` | 503 | No hay contrato configurado y no está `API_MODE=mock` |
| `CONFIGURACION` | 500 / 503 | Falta o es inválida una variable del servidor (`DEMO_CLAVE`, `COTIZACION_SECRETO`, `CHEQUE_FUND_FROM_BLOCK`, claves) |
| `COTIZACION_INVALIDA` | 403 | La cotización que mandó el cliente no trae una `firma` válida, venció o fue modificada |
| `PYME_NO_AUTORIZADA` | 403 | La pyme de la cotización no es la wallet de demo del servidor |
| `DATOS_INVALIDOS` | 400 / 415 | Body inválido (montos, fechas, ids, topes de aporte de la demo); 415 si no es JSON |
| `ARGT_NO_DISPONIBLE` | 502 | No se pudo leer el ARGt real de Base mainnet |


```ts
type RolCuentaDemo = 'admin' | 'originador' | 'oraculo' | 'inversor1' | 'inversor2' | 'pyme';
interface CuentaDemoEstado { id: RolCuentaDemo; direccion: string; eth: string; argt: string; kyc: boolean }
```

Tipos v2 (fuente: `src/shared/types.ts`, sección v2; manda `docs/V2-SPEC.md`):

```ts
interface ResumenFondo {
  totalAssets: string; liquidez: string; enCheques: string;
  valorCuotaparte: string;          // pesos por cuotaparte (convertToAssets(1e18)/1e18); $ 1.000 al inicio
  cantidadCheques: Record<'Pending'|'Funded'|'Paid'|'Rejected', number>;
  concentracionMaxBps: number;      // la del emisor con más exposición, sobre el patrimonio
  rechazos: { cantidad: number; perdida: string };
  tirAnualizadaBps: number | null;  // sobre activos cerrados; null si no hay
  direccionContrato: string; red: 'base-sepolia';
  politica: PoliticaFondo;          // 10 % emisor, 25 % industria, 15 % liquidez, 3 % comisión; objetivo 40 % TNA (solo informativo)
  composicion: { porEmisor: PorcionComposicion[]; porIndustria: PorcionComposicion[]; porTipo: PorcionComposicion[] };
  liquidezBps: number; cuotapartesEmitidas: string;
  comision: { devengadaCuotapartes: string; devengadaPesos: string };   // ya emitida al receptor + pendiente
  rescatesPendientes: number; modoDemo: boolean;
}
// PorcionComposicion { clave, etiqueta, monto, bps }: sobre lo comprado (Funded, a costo); los bps de cada eje suman 10000.
// Emisor: nombre si el hash coincide con un CUIT de shared/fixtures/cheques-demo.json (hashLibrador con CUIT_SALT); si no, hash corto.

interface ChequeVista {
  id: string; libradorHashCorto: string;   // 0x9f3a…c41e
  nominal: string; precioCompra: string; vencimiento: string;
  puntaje: number; banda: Banda; tasaTnaBps: number;
  estado: 'Pending'|'Funded'|'Paid'|'Rejected';
  explicacion: string; txs: { tipo: string; hash: string; url: string }[];  // links a BaseScan
  tipo: 'cheque'|'pagare'; industria: string;   // nombre de shared/industrias.json
  emisorNombre: string | null; garantia: { tipo: TipoGarantia; coberturaBps: number } | null;
}

// RescateVista { id, duenio, cuotapartes, solicitadoEn, liquidableDesde, estado: 'Pendiente'|'Liquidado'|'Cancelado', monto: string|null }
// PosicionInversor { cuenta, cuotapartes (las de su wallet, sin las que están en custodia por un rescate), valor, rescates }
interface ResultadoLiquidacion {   // src/lib/chain/rescates.ts
  liquidados: { id, duenio, cuotapartes, monto, tx }[];
  omitidos: { id, motivo }[];      // sin liquidez: quedan Pendientes
  pendientesNoVencidos: number;
  liquidezAntes: string; liquidezDespues: string; liquidezDespuesBps: number; reservaMinimaBps: number;
  modoDemo: boolean;
  explicacionGestor: string;       // liquidez vs. rescates e impacto en la reserva del 15 %
}
```

**Cotización → cheque (v2):** `POST /api/cotizar` acepta además `tipo` ('cheque'|'pagare'), `garantia` (`GarantiaInput`) y `balance` (texto). `registrarCheque` arma el struct del contrato desde la cotización firmada: `tipo`, `industria.id`, y `garantia.tipo` / `coberturaBps` / `garantiaHash` (o ceros sin garantía). Sin esos campos responde 403 `COTIZACION_INVALIDA`. La firma cubre además el hash canónico de toda la cotización.

**Mock (`API_MODE=mock`):** el estado vive en memoria del proceso (`src/app/api/_lib/mock.ts`, parte de `shared/fixtures/api/*.json`): solicitar y liquidar rescates funciona de verdad y mueve patrimonio, cuotapartes y posición. Todas las tx son de ejemplo (`0xabab…`).

**Día 1:** el esqueleto deja estas rutas devolviendo datos falsos desde `shared/fixtures/`, para que Joaquín arranque la UI sin esperar. Rama las reemplaza por las reales **una por una, sin cambiar la forma de la respuesta**.

### Adicional (7-11-2026): detalle del activo e informe del agente
Cambios aditivos, no rompen nada de lo anterior.
- `POST /api/agente/analizar` suma `informe: InformeActivo` (`src/lib/agent/informe.ts`) al JSON y al evento `resultado` del NDJSON (`{ tipo: "resultado", resultado, informe? }`). `ResultadoAgente` suma `proyecciones?` (concentración del emisor, industria y liquidez posterior, en bps, que calculó el gestor). El informe separa `reglas` (con `verifica: "sistema" | "contrato"`; las del contrato muestran la proyección, `cumple: null` si no se evaluó), `decision` (la del backend), `empresa` (CUIT enmascarado), `activo` (con rentabilidad esperada estimada, no garantizada), `garantia`, `industria`, `mav`, `alertas` y `agente` (explicación y pasos). Es público: nunca lleva el CUIT completo. Se guarda en memoria del servidor (12 h, máximo 200); no hay base de datos. `POST /api/agente/mandato` también lo guarda.
- `GET /api/cheques/[id]` (público, como la lista) responde `ChequeDetalle` (`src/lib/detalle-cheque.ts`): `{ cheque: ChequeVista, cotizacionHash, libradorHash, historial: { tipo, hash, url }[], informe: InformeActivo | null }`. Errores: `400 DATOS_INVALIDOS` (id mal formado), `404 CHEQUE_INEXISTENTE`. El `informe` solo viene si el servidor lo tiene y su hash coincide con el registrado on-chain; si no, `null`.

---

## Pantallas (Joaquín)

1. **`/` Panel público:** resumen del fondo (cartera, liquidez, concentración máxima, rechazos, TIR), tabla de cheques con estado y links a BaseScan, dirección del contrato, ARGt real leído de mainnet.
2. **`/pyme` Cargar cheque:** formulario (CUIT del librador, monto, vencimiento) → cotización con puntaje, banda, tasa, adelanto y explicación → "Aceptar" → registrar y fondear, mostrando cada estado.
3. **`/invertir` Inversor:** elegir cuenta de demo → KYC (aprobar) → invertir ARGt → ver cuotapartes y valor.
4. **`/demo` Control (solo para nosotros):** "adelantar tiempo" (pagar o rechazar cada cheque Funded) y el estado de las wallets de demo.

Footer en todas: *"Prototipo en testnet · sin dinero real · no es oferta pública"*.
