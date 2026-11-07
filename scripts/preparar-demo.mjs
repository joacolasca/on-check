// Deja la demo en su estado de partida usando la API (sirve contra localhost o contra el deploy):
//   1. aprueba el KYC de los dos inversores y carga el pool de demo v2 (70 M + 30 M = $ 100.000.000, de shared/fixtures/cheques-demo.json)
//   2. carga y fondea los activos de partida: cheques de Coto (se paga) y Cencosud (rebota, simulado) y dos pagarés con garantía
//      (Pampa Energía: turbina eólica; Loma Negra: camión), con `tipo` y `garantia` en la cotización
//   3. carga el de Telecom y lo deja Pending (para mostrar los cuatro estados)
// Los dos cheques de MercadoLibre (el camino feliz y la regla del 10 % por emisor) se cargan en vivo, desde /pyme.
// Si DEMO_CLAVE está definida, se manda en el header x-demo-clave (las rutas que firman la exigen).
// Uso: node scripts/preparar-demo.mjs http://localhost:3000 [--forzar] [--sin-pool | --solo-pool]
//   --sin-pool:  no vuelve a cargar a los inversores (para retomar si se cortó después del depósito)
//   --solo-pool: carga SOLO a los dos inversores ($ 70 M y $ 30 M) y no compra nada: es la partida de la demo del Mandato
//                (la corrida del mandato compra el resto desde /mandato). Reintenta ante RED_BLOCKCHAIN_SATURADA como siempre.
//   --ayuda:     muestra este texto
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Pesos por cuotaparte con el fondo vacío (V2-SPEC). */
const PRECIO_INICIAL = 1000n;

const ESCENARIOS_DE_PARTIDA = [
  { escenario: "sano-2", fondear: true },
  { escenario: "rebote", fondear: true },
  { escenario: "pagare-energia", fondear: true },
  { escenario: "pagare-vehiculo", fondear: true },
  { escenario: "pendiente-con-antecedente", fondear: false },
];

/** AAAA-MM-DD en Buenos Aires, `dias` días después de `hoy`. */
export function fechaMas(hoy, dias) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(hoy.getTime() + dias * 86_400_000));
}

export async function prepararDemo({ base, fixtures, fetchFn = fetch, log = console.log, forzar = false, sinPool = false, soloPool = false, esperaMs = 5000, hoy = new Date(), clave = process.env.DEMO_CLAVE }) {
  if (sinPool && soloPool) throw new Error("--sin-pool y --solo-pool se excluyen: uno no carga el pool y el otro carga solo el pool.");
  // Si el proveedor de la blockchain responde "demasiados pedidos", se espera y se reintenta (hasta 6 veces).
  const pedir = async (metodo, ruta, body) => {
    for (let intento = 1; ; intento++) {
      const res = await fetchFn(`${base}${ruta}`, {
        method: metodo,
        headers: { "content-type": "application/json", ...(clave ? { "x-demo-clave": clave } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (res.ok) return cuerpo;
      const codigo = cuerpo?.error?.codigo;
      if (intento < 6 && (codigo === "RED_BLOCKCHAIN_SATURADA" || codigo === "RED_BLOCKCHAIN")) {
        log(`   (${codigo}: reintento ${intento}/5 en ${(esperaMs * intento) / 1000} s)`);
        await new Promise((r) => setTimeout(r, esperaMs * intento));
        continue;
      }
      throw new Error(`${metodo} ${ruta} → ${codigo ?? res.status}: ${cuerpo?.error?.mensaje ?? "error"}`);
    }
  };

  const fondo = await pedir("GET", "/api/fondo");
  if (/[1-9]/.test(String(fondo.totalAssets)) && !forzar) {
    throw new Error("El fondo ya tiene fondos: la demo ya está preparada (o hay datos). Usá --forzar si querés cargar igual.");
  }

  log(soloPool ? "1/2 Inversores y pool de demo (solo el pool: no se compra nada)" : "1/3 Inversores y pool de demo");
  for (const cuenta of sinPool ? [] : ["inversor1", "inversor2"]) {
    // El despliegue ya deja el KYC aprobado; solo se pide si falta (en producción no hay clave de admin).
    const cuentas = await pedir("GET", "/api/demo/cuentas").catch(() => []);
    if (!Array.isArray(cuentas) || cuentas.find((c) => c.id === cuenta)?.kyc !== true) await pedir("POST", "/api/demo/kyc", { cuenta });
    const monto = fixtures.pool_demo[`${cuenta}_deposito`];
    // Se suscriben cuotapartes enteras (mínimo 1.000, de a 1): al valor inicial de $ 1.000, 70.000 y 30.000.
    const cuotapartes = (BigInt(monto.split(".")[0]) / PRECIO_INICIAL).toString();
    const r = await pedir("POST", "/api/demo/invertir", { cuenta, cuotapartes });
    log(`   ${cuenta}: KYC aprobado y suscripción de ${r.shares} cuotapartes (≈ $ ${r.monto})`);
  }

  if (soloPool) {
    const despues = await pedir("GET", "/api/fondo");
    log(`2/2 Listo. Patrimonio ${despues.totalAssets}, liquidez ${despues.liquidez}, sin cheques: la corrida del mandato compra el resto.`);
    return [];
  }

  log("2/3 Cheques de partida");
  const resumen = [];
  for (const { escenario, fondear } of ESCENARIOS_DE_PARTIDA) {
    const c = fixtures.cheques.find((x) => x.escenario === escenario);
    if (!c) throw new Error(`Falta el escenario "${escenario}" en cheques-demo.json`);
    // Con el agente gestor (no con /api/cotizar): es el que estima la industria del emisor, que el contrato usa para el tope del 25 %.
    // Sin esto todo quedaría "Sin clasificar" (id 0) y la regla por industria agruparía emisores que no tienen nada que ver.
    const { cotizacion: cot } = await pedir("POST", "/api/agente/analizar", {
      cuit: c.librador_cuit,
      nominal: c.nominal,
      vencimiento: fechaMas(hoy, c.dias),
      ...(c.tipo ? { tipo: c.tipo } : {}),
      ...(c.garantia ? { garantia: c.garantia } : {}),
    });
    if (!cot.aprobada) throw new Error(`La cotización de ${c.librador_nombre} no fue aprobada: ${cot.motivoRechazo}`);
    await pedir("POST", "/api/cheques", { cotizacionId: cot.id, cotizacion: cot });
    if (fondear) await pedir("POST", `/api/cheques/${cot.id}/fondear`);
    log(`   ${c.librador_nombre} (${c.tipo ?? "cheque"}${c.garantia ? ` con garantía: ${c.garantia.tipo}` : ""}): $ ${c.nominal} a ${c.dias} días → ${fondear ? "Funded" : "Pending"} (id ${cot.id.slice(0, 10)}…)`);
    resumen.push({ escenario, id: cot.id, estado: fondear ? "Funded" : "Pending" });
  }

  const despues = await pedir("GET", "/api/fondo");
  log(`3/3 Listo. Cartera ${despues.totalAssets}, liquidez ${despues.liquidez}, cheques: ${JSON.stringify(despues.cantidadCheques)}`);
  return resumen;
}

// Ejecución desde la terminal
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--ayuda") || process.argv.includes("-h")) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 13).map((l) => l.slice(3)).join("\n"));
    process.exit(0);
  }
  const base = (process.argv.find((a, i) => i >= 2 && !a.startsWith("--") && a !== "-h") ?? "http://localhost:3000").replace(/\/$/, "");
  const fixtures = JSON.parse(readFileSync(new URL("../shared/fixtures/cheques-demo.json", import.meta.url), "utf8"));
  prepararDemo({ base, fixtures, forzar: process.argv.includes("--forzar"), sinPool: process.argv.includes("--sin-pool"), soloPool: process.argv.includes("--solo-pool") }).catch((e) => {
    console.error(`\n✗ ${e.message}`);
    process.exit(1);
  });
}
