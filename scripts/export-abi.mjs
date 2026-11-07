// Exporta el ABI de los contratos a src/shared/abi/. Corre `forge build` antes (ver `pnpm abi`).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const contratos = ["ChequeFund", "ChequeToken", "MockARGt"];
mkdirSync("src/shared/abi", { recursive: true });
for (const nombre of contratos) {
  const artefacto = JSON.parse(readFileSync(`contracts/out/${nombre}.sol/${nombre}.json`, "utf8"));
  writeFileSync(`src/shared/abi/${nombre}.json`, JSON.stringify(artefacto.abi, null, 2) + "\n");
  console.log(`ABI de ${nombre}: ${artefacto.abi.length} entradas`);
}
