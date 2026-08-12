/**
 * Estructura con IA todas las recetas pendientes (importado / error_ia).
 * Uso: npm run structure:all
 */
import "../src/lib/load-env";
import { structureAllPending } from "../src/lib/structure-recipe";

async function main() {
  const limit = Number(process.argv[2] ?? "500");
  const delayMs = Number(process.argv[3] ?? "1500");
  const result = await structureAllPending({ limit, delayMs });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
