import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@fixtures": fileURLToPath(new URL("./shared/fixtures", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // las herramientas del agente usan datos fijos en los tests; CHAIN_DEPLOYMENT_FILE vacío: los tests no leen el deploy real del repo
    env: { SCORING_MODE: "mock", BCRA_MODE: "cache", CHAIN_DEPLOYMENT_FILE: "" },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
  },
});
