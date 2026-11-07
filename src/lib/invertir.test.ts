import { describe, expect, it } from "vitest";
import { costoEstimado, kycAprobado, leerPosicion, MIN_CUOTAPARTES, POSICION_VACIA, totalCuotapartes, totalInvertido, validarCuotapartesSuscripcion, validarMontoInversion, valorPosicion } from "./invertir";

const pos = { kyc: true, depositos: [{ monto: "20000000", shares: "20000000", tx: "0x1" }, { monto: "5000000", shares: "5000000", tx: "0x2" }] };

describe("posición", () => {
  it("suma depósitos y cuotapartes", () => {
    expect(totalInvertido(pos)).toBe("25000000");
    expect(totalCuotapartes(pos)).toBe("25000000");
  });
  it("valúa con el valor de la cuotaparte, sin number", () => {
    expect(valorPosicion(pos, "1.0")).toEqual({ cuotapartes: "25000000", invertido: "25000000", valorActual: "25000000", variacion: "0" });
    expect(valorPosicion(pos, "1.02").variacion).toBe("500000");
    expect(valorPosicion(pos, "0.97").variacion).toBe("-750000");
  });
  it("una posición vacía vale cero", () => {
    expect(valorPosicion(POSICION_VACIA, "1.0").valorActual).toBe("0");
  });
});

describe("validarMontoInversion", () => {
  it("normaliza formato es-AR", () => {
    expect(validarMontoInversion("$ 20.000.000")).toEqual({ monto: "20000000" });
  });
  it("rechaza vacío y cero", () => {
    expect(validarMontoInversion("")).toHaveProperty("error");
    expect(validarMontoInversion("0")).toHaveProperty("error");
  });
});

describe("leerPosicion", () => {
  it("lee un estado guardado", () => {
    expect(leerPosicion(JSON.stringify(pos))).toEqual(pos);
  });
  it("tolera basura y descarta depósitos mal formados", () => {
    expect(leerPosicion("no es json")).toEqual(POSICION_VACIA);
    expect(leerPosicion(null)).toEqual(POSICION_VACIA);
    expect(leerPosicion(JSON.stringify({ kyc: true, depositos: [{ monto: 5 }, pos.depositos[0]] }))).toEqual({ kyc: true, depositos: [pos.depositos[0]] });
  });
});

describe("kycAprobado", () => {
  const cuentas = [
    { id: "inversor1" as const, direccion: "0x1", eth: "1", argt: "0", kyc: true },
    { id: "inversor2" as const, direccion: "0x2", eth: "1", argt: "0", kyc: false },
  ];
  it("toma el KYC de la cadena aunque la sesión no lo tenga", () => {
    expect(kycAprobado("inversor1", false, cuentas)).toBe(true);
  });
  it("sin KYC en la cadena ni en la sesión, sigue pendiente", () => {
    expect(kycAprobado("inversor2", false, cuentas)).toBe(false);
    expect(kycAprobado("inversor1", false, undefined)).toBe(false);
  });
  it("lo aprobado en la sesión cuenta mientras la cadena no se relee", () => {
    expect(kycAprobado("inversor2", true, cuentas)).toBe(true);
  });
});

describe("suscripción: mínimo 1.000 cuotapartes, de a 1", () => {
  it("el mínimo son 1.000 cuotapartes y cuesta $ 1.000.000 al valor inicial", () => {
    expect(MIN_CUOTAPARTES).toBe("1000");
    expect(costoEstimado("1000", "1000")).toBe("1000000");
    expect(costoEstimado("1001", "952.5703013")).toBe("953522.8716013");
  });
  it("acepta el mínimo exacto y de a una más, con o sin punto de miles", () => {
    expect(validarCuotapartesSuscripcion("1000", "1000")).toEqual({ cuotapartes: "1000" });
    expect(validarCuotapartesSuscripcion("1.001", "1000")).toEqual({ cuotapartes: "1001" });
    expect(validarCuotapartesSuscripcion("70.000", "1000")).toEqual({ cuotapartes: "70000" });
  });
  it("999 no alcanza y el mensaje dice cuánto cuesta el mínimo", () => {
    const r = validarCuotapartesSuscripcion("999", "1000");
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toMatch(/mínima es de 1\.000 cuotapartes \(≈ \$ 1\.000\.000 al valor de hoy\)/);
  });
  it("no acepta fracciones ni vacío ni texto", () => {
    expect(validarCuotapartesSuscripcion("1000,5", "1000")).toHaveProperty("error");
    expect(validarCuotapartesSuscripcion("1000.5", "1000")).toHaveProperty("error");
    expect(validarCuotapartesSuscripcion("", "1000")).toHaveProperty("error");
    expect(validarCuotapartesSuscripcion("mil", "1000")).toHaveProperty("error");
  });
});
