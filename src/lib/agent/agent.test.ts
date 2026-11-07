import { describe, expect, it } from "vitest";
import cotizacionFija from "@fixtures/api/cotizacion.json";
import type { Cotizacion, InputCotizacion } from "@/shared/types";
import { cotizacionIntegra } from "@/lib/scoring/cotizar";
import { analizarCheque, MAX_PASOS } from "./index";
import { herramientasPorDefecto } from "./herramientas";
import type { Accion, Analista, CarteraActual, EstadoAgente, Herramientas } from "./types";

const FIJA = cotizacionFija as unknown as Cotizacion;
const input: InputCotizacion = { cuit: "30703088534", nominal: "10000000", vencimiento: "2027-01-05", pyme: "0x0000000000000000000000000000000000000001" };
const conGarantia: InputCotizacion = {
  ...input,
  tipo: "pagare",
  garantia: { tipo: "vehiculo", descripcion: "Camioneta usada, descripción de ejemplo", valorDeclarado: "20000000", documentos: ["Tasación de agosto"] },
};

const conHerramientas = (cambios: Partial<Herramientas>): Herramientas => ({ ...herramientasPorDefecto(), ...cambios });

/** Analista que reúne lo mínimo y concluye con lo que se le pasa. */
const analistaQueConcluye = (c: Extract<Accion, { tipo: "concluir" }>): Analista => ({
  modo: "agente",
  async siguiente(e: EstadoAgente): Promise<Accion> {
    if (!e.scoring) return { tipo: "usar", herramienta: "consultar_bcra" };
    if (!e.cotizacion) return { tipo: "usar", herramienta: "emitir_cotizacion" };
    return c;
  },
});
const concluir = (decision: Extract<Accion, { tipo: "concluir" }>["decision"], resumen: string, extra: { condiciones?: string[]; motivo?: string | null } = {}): Extract<Accion, { tipo: "concluir" }> => ({
  tipo: "concluir", decision, resumen, condiciones: extra.condiciones ?? [], motivo: extra.motivo ?? null,
});

describe("agente · camino normal", () => {
  it("recorre política, BCRA, cartera, MAV, balance, industria, garantía y cotización, y concluye aprobando", async () => {
    const r = await analizarCheque(input);
    expect(r.modo).toBe("determinista");
    expect(r.pasos.filter((p) => p.tipo === "herramienta").map((p) => p.herramienta)).toEqual([
      "ver_politica_del_fondo", "consultar_bcra", "ver_cartera_actual", "consultar_mav", "analizar_balance", "clasificar_industria", "analizar_garantia", "emitir_cotizacion",
    ]);
    expect(r.pasos.at(-1)?.tipo).toBe("conclusion");
    expect(r.pasos.map((p) => p.n)).toEqual(r.pasos.map((_, i) => i + 1));
    expect(r.cotizacion.aprobada).toBe(true);
    expect(r.cotizacion.decisionPM?.decision).toBe("aprobar");
    expect(r.alertas).toEqual([]);
    expect(r.pasos.length).toBeLessThanOrEqual(MAX_PASOS);
  });

  it("los números salen de cotizar(), no del agente", async () => {
    const r = await analizarCheque(input);
    expect(r.cotizacion.precioCompra).toBe(FIJA.precioCompra);
    expect(r.cotizacion.tasaTnaBps).toBe(FIJA.tasaTnaBps);
  });

  it("ningún texto dice 'rinde' ni 'rendimiento garantizado' ni la sigla de la tecnología", async () => {
    const r = await analizarCheque(conGarantia);
    const c = r.cotizacion;
    const texto = [...r.pasos.map((p) => `${p.titulo} ${p.detalle}`), c.explicacion, c.decisionPM?.resumen, ...(c.decisionPM?.condiciones ?? []), c.industria.fundamento, c.garantia?.observaciones, c.mav?.nota, ...r.alertas].join(" ");
    expect(texto).not.toMatch(/rinde|rendimiento garantizado/i);
    expect(texto).not.toMatch(/\b(?:IA|AI)\b/);
  });
});

describe("agente · v2 (tipo, industria, MAV, balance, garantía)", () => {
  it("la cotización trae tipo, industria estimada y MAV simulado; sin garantía no hay garantía", async () => {
    const r = await analizarCheque(input);
    expect(r.cotizacion.tipo).toBe("cheque");
    expect(r.cotizacion.industria).toMatchObject({ id: 2, nombre: "Tecnología y comercio electrónico" });
    expect(r.cotizacion.mav?.fuente).toBe("MAV (simulado)");
    expect(r.cotizacion.garantia).toBeUndefined();
    expect(cotizacionIntegra(r.cotizacion)).toBe(true);
  });

  it("un pagaré con garantía se aprueba con condiciones: lo que falta para la prenda legal", async () => {
    const r = await analizarCheque(conGarantia);
    expect(r.cotizacion.tipo).toBe("pagare");
    expect(r.cotizacion.garantia?.tipo).toBe("vehiculo");
    expect(r.cotizacion.garantia?.analizadoPor).toBe("determinista");
    expect(r.cotizacion.decisionPM?.decision).toBe("aprobar_con_condiciones");
    expect(r.cotizacion.decisionPM?.condiciones.join(" ")).toMatch(/prenda/i);
    expect(r.pasos.at(-1)?.titulo).toMatch(/pagaré con condiciones/);
    expect(cotizacionIntegra(r.cotizacion)).toBe(true);
  });

  it("sin balance lo dice (solo BCRA); con balance usa lo que pudo leer y no inventa el resto", async () => {
    const sin = await analizarCheque(input);
    expect(sin.cotizacion.decisionPM?.resumen).toMatch(/Sin balance cargado/);
    const con = await analizarCheque({ ...input, balance: "Ventas netas 2025: $ 12.500.000\nPatrimonio neto: 4.000.000" });
    const paso = con.pasos.find((p) => p.titulo === "Reviso el balance cargado");
    expect(paso?.detalle).toMatch(/ventas \$ 12\.500\.000/);
    expect(paso?.detalle).toMatch(/No encontré: deuda, liquidez/);
    expect(con.cotizacion.input.balance).toBeUndefined(); // el texto del balance no viaja dentro de la cotización
  });

  it("el MAV siempre se rotula como simulado, en el paso y en la cotización", async () => {
    const r = await analizarCheque(input);
    const paso = r.pasos.find((p) => p.titulo.includes("MAV"));
    expect(paso?.titulo).toMatch(/simulado/);
    expect(r.pasos.find((p) => p.detalle.includes("MAV (simulado)"))).toBeDefined();
    expect(r.cotizacion.mav?.nota).toMatch(/simulado/i);
  });

  it("si el modelo pide emitir la cotización sin haber corrido lo anterior, el bucle corre lo que falta (y se ve)", async () => {
    const apurado: Analista = {
      modo: "agente",
      async siguiente(e) {
        return e.cotizacion ? concluir("aprobar", "Todo en orden.") : { tipo: "usar", herramienta: "emitir_cotizacion" };
      },
    };
    const r = await analizarCheque(input, { analista: apurado });
    expect(r.modo).toBe("agente");
    expect(r.pasos.filter((p) => p.tipo === "herramienta").map((p) => p.herramienta)).toEqual([
      "consultar_bcra", "consultar_mav", "analizar_balance", "clasificar_industria", "analizar_garantia", "emitir_cotizacion",
    ]);
    expect(r.cotizacion.industria.id).toBe(2);
  });
});

describe("agente · garantías", () => {
  const rechazada: Cotizacion = { ...FIJA, aprobada: false, motivoRechazo: "Banda D: no se compra." };

  it("nunca aprueba lo que las reglas rechazan, aunque el analista lo pida", async () => {
    const r = await analizarCheque(input, { analista: analistaQueConcluye(concluir("aprobar", "Todo bien.")), herramientas: conHerramientas({ emitir_cotizacion: async () => rechazada }) });
    expect(r.cotizacion.aprobada).toBe(false);
    expect(r.cotizacion.motivoRechazo).toBe("Banda D: no se compra.");
    expect(r.cotizacion.decisionPM?.decision).toBe("rechazar");
    expect(r.cotizacion.decisionPM?.condiciones).toEqual([]);
    expect(r.pasos.at(-1)?.titulo).toMatch(/no comprar/i);
  });

  it("reemplaza un resumen con frases prohibidas por un texto seguro", async () => {
    const r = await analizarCheque(input, { analista: analistaQueConcluye(concluir("aprobar", "El ARGt rinde un 30 %")) });
    expect(r.cotizacion.decisionPM?.resumen).toBe(FIJA.explicacion);
    const r2 = await analizarCheque(input, { analista: analistaQueConcluye(concluir("aprobar", "Lo analizó la IA del fondo.")) });
    expect(r2.cotizacion.decisionPM?.resumen).toBe(FIJA.explicacion);
  });

  it("descarta las condiciones prohibidas y coherentiza la decisión con las condiciones", async () => {
    const r = await analizarCheque(input, { analista: analistaQueConcluye(concluir("aprobar_con_condiciones", "Bien.", { condiciones: ["Rendimiento garantizado del 40 %", "Pedir el título"] })) });
    expect(r.cotizacion.decisionPM).toEqual({ decision: "aprobar_con_condiciones", condiciones: ["Pedir el título"], resumen: "Bien." });
    const r2 = await analizarCheque(input, { analista: analistaQueConcluye(concluir("aprobar_con_condiciones", "Bien.")) });
    expect(r2.cotizacion.decisionPM?.decision).toBe("aprobar"); // sin condiciones no hay "con condiciones"
  });

  it("si el analista falla, cae al determinístico y devuelve igual la cotización", async () => {
    const roto: Analista = { modo: "agente", async siguiente(): Promise<Accion> { throw new Error("sin conexión"); } };
    const r = await analizarCheque(input, { analista: roto });
    expect(r.modo).toBe("determinista");
    expect(r.cotizacion.aprobada).toBe(true);
  });

  it("al caer al determinístico usa las herramientas de respaldo (sin modelo)", async () => {
    const roto: Analista = { modo: "agente", async siguiente(): Promise<Accion> { throw new Error("sin conexión"); } };
    const conModelo = conHerramientas({ clasificar_industria: async () => { throw new Error("no debería usarse"); } });
    const r = await analizarCheque(input, { analista: roto, herramientas: conModelo, herramientasRespaldo: herramientasPorDefecto() });
    expect(r.modo).toBe("determinista");
    expect(r.cotizacion.industria.id).toBe(2);
  });

  it("si el analista da vueltas sin concluir, corta en el máximo de pasos y cae al determinístico", async () => {
    const infinito: Analista = { modo: "agente", async siguiente(): Promise<Accion> { return { tipo: "pensar", titulo: "Hmm", detalle: "…" }; } };
    const r = await analizarCheque(input, { analista: infinito, maxPasos: 5 });
    expect(r.modo).toBe("determinista");
    expect(r.pasos.length).toBeLessThanOrEqual(MAX_PASOS);
  });

  it("si el analista tarda demasiado, cae al determinístico", async () => {
    const lento: Analista = { modo: "agente", siguiente: () => new Promise<Accion>(() => {}) };
    const r = await analizarCheque(input, { analista: lento, timeoutMs: 20 });
    expect(r.modo).toBe("determinista");
  });

  it("si falla una herramienta del analista determinístico, el error se propaga (no hay otra red)", async () => {
    await expect(analizarCheque(input, { herramientas: conHerramientas({ consultar_bcra: async () => { throw new Error("BCRA caído"); } }) })).rejects.toThrow("BCRA caído");
  });
});

describe("agente · las reglas deciden, no el agente", () => {
  const pesimista = analistaQueConcluye(concluir("rechazar", "No conviene comprarlo ahora.", { motivo: "La concentración quedaría alta." }));
  it("si las reglas aprueban y el gestor recomienda no comprar, sigue aprobada y se agrega un aviso", async () => {
    const r = await analizarCheque(input, { analista: pesimista });
    expect(r.cotizacion.aprobada).toBe(true); // el contrato decide, no el agente
    expect(r.cotizacion.motivoRechazo).toBeNull();
    expect(r.cotizacion.explicacion).toBe(FIJA.explicacion); // la explicación de la cotización no la pisa el agente
    expect(r.cotizacion.decisionPM?.decision).toBe("rechazar");
    expect(r.alertas.some((a) => a.includes("El agente recomienda no comprar este cheque: La concentración quedaría alta."))).toBe(true);
    expect(r.pasos.at(-1)?.titulo).toMatch(/Recomiendo no comprar/);
  });
  it("el hash de la cotización siempre corresponde a su contenido final (incluye la decisión del PM)", async () => {
    const r = await analizarCheque(input, { analista: pesimista });
    expect(cotizacionIntegra(r.cotizacion)).toBe(true);
    const r2 = await analizarCheque(input, { analista: analistaQueConcluye(concluir("aprobar", "Texto del agente.")) });
    expect(r2.cotizacion.decisionPM?.resumen).toBe("Texto del agente.");
    expect(cotizacionIntegra(r2.cotizacion)).toBe(true);
    expect(r2.cotizacion.cotizacionHash).not.toBe(r.cotizacion.cotizacionHash);
  });
});

describe("agente · límites del fondo (el servidor rechaza con la misma cuenta que el contrato)", () => {
  const cartera = (c: Partial<CarteraActual> = {}): Herramientas =>
    conHerramientas({ ver_cartera_actual: async () => ({ totalAssets: "100000000", exposicionPorLibrador: {}, exposicionPorIndustria: {}, liquidez: "100000000", ...c }) });
  const rechazada = (r: Awaited<ReturnType<typeof analizarCheque>>, motivo: RegExp) => {
    expect(r.cotizacion.aprobada).toBe(false);
    expect(r.cotizacion.motivoRechazo).toMatch(motivo);
    expect(r.cotizacion.decisionPM?.decision).toBe("rechazar");
    expect(cotizacionIntegra(r.cotizacion)).toBe(true);
    expect(r.alertas.some((x) => motivo.test(x))).toBe(true);
    expect(r.pasos.at(-1)?.titulo).toMatch(/no comprar/);
  };

  it("emisor: si pasaría el 10 % se rechaza con el motivo", async () => {
    const r = await analizarCheque(input, { herramientas: cartera({ exposicionPorLibrador: { [FIJA.libradorHash]: "5000000" } }) });
    rechazada(r, /El emisor quedaría en .* del fondo, por encima del tope de 10 %/);
  });

  it("emisor: el librador se busca sin distinguir mayúsculas del hash", async () => {
    const r = await analizarCheque(input, { herramientas: cartera({ exposicionPorLibrador: { [FIJA.libradorHash.toUpperCase().replace("0X", "0x")]: "5000000" } }) });
    expect(r.cotizacion.aprobada).toBe(false);
  });

  it("emisor: justo en el tope (10 % exacto) se aprueba, como el contrato (compara con >)", async () => {
    const precio = FIJA.precioCompra; // pesos con 2 decimales
    const [ent, dec = ""] = precio.split(".");
    const centavos = BigInt(ent + dec.padEnd(2, "0"));
    const patrimonio = (centavos * 10n).toString();
    const pesos = (c: bigint) => `${c / 100n}.${(c % 100n).toString().padStart(2, "0")}`;
    const r = await analizarCheque(input, { herramientas: cartera({ totalAssets: pesos(BigInt(patrimonio)), liquidez: pesos(BigInt(patrimonio)) }) });
    expect(r.cotizacion.aprobada).toBe(true);
    const r2 = await analizarCheque(input, { herramientas: cartera({ totalAssets: pesos(BigInt(patrimonio) - 1n), liquidez: pesos(BigInt(patrimonio) - 1n) }) });
    expect(r2.cotizacion.aprobada).toBe(false);
  });

  it("industria: si pasaría el 25 % se rechaza", async () => {
    const r = await analizarCheque(input, { herramientas: cartera({ exposicionPorIndustria: { "2": "20000000" } }) });
    rechazada(r, /industria "Tecnología y comercio electrónico" quedaría en .*tope de 25 %/);
  });

  it("liquidez: si pagar el activo dejaría menos del 15 % se rechaza", async () => {
    const r = await analizarCheque(input, { herramientas: cartera({ liquidez: "20000000" }) });
    rechazada(r, /liquidez en .* del fondo, por debajo del mínimo de 15 %/);
  });

  it("liquidez: si no alcanza para pagar el activo se rechaza", async () => {
    const r = await analizarCheque(input, { herramientas: cartera({ liquidez: "1000000" }) });
    rechazada(r, /no alcanza para pagar/);
  });

  it("fondo vacío: no se aprueba (con patrimonio 0 el contrato no deja comprar)", async () => {
    const r = await analizarCheque(input, { herramientas: cartera({ totalAssets: "0", liquidez: "0" }) });
    rechazada(r, /todavía no tiene patrimonio/);
  });

  it("cartera que el servidor no puede leer: no se aprueba automáticamente", async () => {
    const h = conHerramientas({ ver_cartera_actual: async () => { throw new Error("RPC caído"); } });
    const r = await analizarCheque(input, { analista: analistaQueConcluye(concluir("aprobar", "Todo bien.")), herramientas: h });
    rechazada(r, /No pudimos verificar los límites del fondo; no se aprueba automáticamente\./);
  });

  it("cartera sin industrias o sin liquidez: no se puede verificar, no se aprueba", async () => {
    const h = conHerramientas({ ver_cartera_actual: async () => ({ totalAssets: "100000000", exposicionPorLibrador: {} }) });
    const r = await analizarCheque(input, { herramientas: h });
    rechazada(r, /No pudimos verificar los límites/);
  });

  it("si el analista no miró la cartera, la lee el servidor", async () => {
    let lecturas = 0;
    const h = conHerramientas({ ver_cartera_actual: async () => { lecturas += 1; return { totalAssets: "100000000", exposicionPorLibrador: { [FIJA.libradorHash]: "5000000" }, exposicionPorIndustria: {}, liquidez: "100000000" }; } });
    const r = await analizarCheque(input, { analista: analistaQueConcluye(concluir("aprobar", "Todo bien.")), herramientas: h });
    expect(lecturas).toBe(1);
    rechazada(r, /El emisor quedaría/);
  });

  it("el gestor no puede aprobar lo que rompe un límite", async () => {
    const r = await analizarCheque(input, { analista: analistaQueConcluye(concluir("aprobar", "Aprobado por mí.")), herramientas: cartera({ liquidez: "20000000" }) });
    expect(r.cotizacion.aprobada).toBe(false);
    expect(r.cotizacion.decisionPM?.resumen).not.toMatch(/Aprobado por mí/);
  });

  it("si las reglas de cotización ya rechazaron, no se pide la cartera", async () => {
    let lecturas = 0;
    const h = conHerramientas({
      emitir_cotizacion: async () => ({ ...FIJA, aprobada: false, motivoRechazo: "Puntaje bajo el mínimo." }),
      ver_cartera_actual: async () => { lecturas += 1; throw new Error("no se debería pedir"); },
    });
    const r = await analizarCheque(input, { analista: analistaQueConcluye(concluir("rechazar", "No.", { motivo: "No." })), herramientas: h });
    expect(lecturas).toBe(0);
    expect(r.cotizacion.motivoRechazo).toBe("Puntaje bajo el mínimo.");
  });

  it("sin exposición previa y con el pool de demo, se aprueba sin alertas", async () => {
    const r = await analizarCheque(input);
    expect(r.cotizacion.aprobada).toBe(true);
    expect(r.alertas).toEqual([]);
  });
});

describe("agente · pasos en vivo", () => {
  it("avisa cada paso apenas se produce y en orden", async () => {
    const vistos: number[] = [];
    const r = await analizarCheque(input, { onPaso: (p) => vistos.push(p.n) });
    expect(vistos).toEqual(r.pasos.map((p) => p.n));
    expect(vistos.length).toBeGreaterThan(4);
  });

  it("si el analista con modelo falla, avisa el reinicio antes de los pasos del determinístico", async () => {
    const eventos: string[] = [];
    const roto: Analista = {
      modo: "agente",
      async siguiente(e) {
        if (e.pasos.length === 0) return { tipo: "usar", herramienta: "ver_politica_del_fondo" };
        throw new Error("se cortó");
      },
    };
    const r = await analizarCheque(input, { analista: roto, onPaso: (p) => eventos.push(`paso${p.n}`), onReinicio: () => eventos.push("reinicio") });
    expect(r.modo).toBe("determinista");
    expect(eventos.filter((x) => x === "reinicio")).toHaveLength(1);
    expect(eventos.indexOf("reinicio")).toBeGreaterThan(0); // hubo al menos un paso antes
    expect(eventos.slice(eventos.indexOf("reinicio") + 1)[0]).toBe("paso1"); // y después arranca de cero
  });
});
