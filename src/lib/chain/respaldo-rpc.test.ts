import { describe, expect, it } from "vitest";
import { RPC_RESPALDO_SEPOLIA, clienteSepolia } from "./clientes";

describe("RPC de respaldo para lecturas", () => {
  it("con un RPC principal distinto, el cliente usa fallback", () => {
    const c = clienteSepolia({ rpcSepolia: "http://principal.test" });
    expect(c.transport.type).toBe("fallback");
  });
  it("si el principal ya es el de respaldo, no se duplica", () => {
    const c = clienteSepolia({ rpcSepolia: RPC_RESPALDO_SEPOLIA });
    expect(c.transport.type).toBe("http");
  });
});
