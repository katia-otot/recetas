/**
 * Estructura recetas con IA.
 *
 * Uso:
 *   npm run structure:all              → solo pendientes (importado / error_ia / procesando)
 *   npm run structure:all -- --redo    → pendientes + rehacer las ya estructuradas
 *   npm run structure:redo             → alias de --redo
 *
 * Args opcionales: [limit] [delayMs]
 *   npm run structure:redo -- 500 1500
 */
import "../../src/lib/load-env";
import { structureAllPending } from "../../src/lib/structure-recipe";

function parseArgs(argv: string[]) {
  const flags = new Set(
    argv.filter((a) => a.startsWith("--")).map((a) => a.slice(2)),
  );
  const positional = argv.filter((a) => !a.startsWith("--"));
  const limit = Number(positional[0] ?? "500");
  const delayMs = Number(positional[1] ?? "1500");
  const redo = flags.has("redo") || flags.has("force");
  return { limit, delayMs, redo };
}

async function main() {
  const { limit, delayMs, redo } = parseArgs(process.argv.slice(2));
  console.log({ limit, delayMs, redo, model: process.env.OPENROUTER_MODEL });
  const result = await structureAllPending({ limit, delayMs, redo });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
