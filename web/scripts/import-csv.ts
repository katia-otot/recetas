/**
 * Importa un CSV exportado desde Google Sheets (uso one-time / mantenimiento).
 * Uso: npm run import:csv -- ../data/veg.csv "Cotidianas/fáciles"
 */
import "../src/lib/load-env";
import { readFileSync } from "fs";
import { importSheetCsv } from "../src/lib/import-sheet";

async function main() {
  const filePath = process.argv[2];
  const sheetTab = process.argv[3];
  const autoStructure = !process.argv.includes("--no-ai");

  if (!filePath) {
    console.error("Uso: npm run import:csv -- <ruta.csv> [nombre_pestaña]");
    process.exit(1);
  }

  const csv = readFileSync(filePath, "utf-8");
  const result = await importSheetCsv(csv, {
    filename: filePath,
    sheetTab,
    autoStructure,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
