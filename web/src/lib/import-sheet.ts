import Papa from "papaparse";
import { prisma } from "./db";
import { uniqueSlug } from "./slug";
import { extractUrls } from "./source-content";
import { structureRecipeIfNeeded } from "./structure-recipe";

export type SheetImportResult = {
  batchId: string;
  imported: number;
  skipped: number;
  errors: string[];
};

const URL_REGEX = /https?:\/\/[^\s,;<>)"']+/gi;

function textWithoutUrls(value: string): string {
  return value.replace(URL_REGEX, " ").replace(/\s+/g, " ").trim();
}

function cell(row: string[], index: number): string {
  return (row[index] ?? "").trim();
}

function isCategoryHeader(row: string[]): boolean {
  const title = cell(row, 0).toLowerCase();
  const categories = new Set([
    "cotidianas/fáciles",
    "para comprar",
    "combinaciones de especias",
    "especiales/raras",
    "otras/dulces",
    "ingredientes para tener en cuenta",
    "condimentos",
  ]);
  return categories.has(title);
}

function hasRecipeContent(row: string[]): boolean {
  const a = cell(row, 0);
  const b = cell(row, 1);
  const c = cell(row, 2);
  const f = cell(row, 5);
  return a.length > 0 || b.length > 0 || c.length > 0 || f.length > 0;
}

function deriveTitle(row: string[]): string {
  const a = cell(row, 0);
  if (a) return a;
  const c = cell(row, 2);
  const firstLine = c.split(/\n/)[0]?.trim();
  if (firstLine && firstLine.length <= 120) return firstLine;
  const b = cell(row, 1);
  if (b) return `Receta (${b.slice(0, 40)}…)`;
  return "Receta sin título";
}

export async function importSheetCsv(
  csvContent: string,
  options: { filename: string; sheetTab?: string; autoStructure?: boolean },
): Promise<SheetImportResult> {
  const autoStructure = options.autoStructure ?? true;
  const parsed = Papa.parse<string[]>(csvContent, {
    skipEmptyLines: true,
  });

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  const batch = await prisma.importBatch.create({
    data: {
      filename: options.filename,
      sheetTab: options.sheetTab,
      rowCount: 0,
    },
  });

  const rows = parsed.data;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;

    if (!hasRecipeContent(row)) {
      skipped += 1;
      continue;
    }

    if (isCategoryHeader(row)) {
      skipped += 1;
      continue;
    }

    const title = deriveTitle(row);
    const columnB = cell(row, 1);
    const columnC = cell(row, 2);
    const rawParts = [textWithoutUrls(columnB), textWithoutUrls(columnC)].filter(
      Boolean,
    );
    const rawText = rawParts.length > 0 ? rawParts.join("\n\n") : null;
    const extraNotes = cell(row, 5) || null;
    const urlCell = [
      columnB,
      columnC,
      cell(row, 3),
      extraNotes ?? "",
    ].join(" ");
    const urls = extractUrls(urlCell);

    if (!rawText && urls.length === 0 && !extraNotes && title === "Receta sin título") {
      skipped += 1;
      continue;
    }

    try {
      const slug = await uniqueSlug(title, async (s) => {
        const found = await prisma.recipe.findUnique({ where: { slug: s } });
        return found !== null;
      });

      const recipe = await prisma.recipe.create({
        data: {
          title,
          slug,
          rawText,
          extraNotes,
          sheetTab: options.sheetTab,
          sheetRow: rowNumber,
          status: "importado",
          sources:
            urls.length > 0
              ? {
                  create: urls.map((url, idx) => ({
                    url,
                    isPrimary: idx === 0,
                  })),
                }
              : undefined,
        },
      });

      imported += 1;

      if (autoStructure) {
        try {
          await structureRecipeIfNeeded(recipe.id);
        } catch (e) {
          errors.push(
            `Fila ${rowNumber} (${title}): IA — ${(e as Error).message}`,
          );
        }
      }
    } catch (e) {
      errors.push(`Fila ${rowNumber} (${title}): ${(e as Error).message}`);
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { rowCount: imported },
  });

  return { batchId: batch.id, imported, skipped, errors };
}
