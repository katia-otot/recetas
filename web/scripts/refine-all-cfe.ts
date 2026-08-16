import "../src/lib/load-env";
import { prisma } from "../src/lib/db";
import {
  assessCfeQuality,
  normalizeAndValidateCfe,
  refineStoredCfe,
} from "../src/lib/cfe";
import {
  parseStoredIngredients,
  type CfeData,
} from "../src/lib/recipe-schema";

const PROTECTED = new Set(["pasta-caprese", "arroz-con-azafran-y-esparragos"]);

async function main() {
  const onlySlug = process.argv[2];
  const recipes = await prisma.recipe.findMany({
    where: {
      cfeJson: { not: null },
      ...(onlySlug ? { slug: onlySlug } : {}),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      ingredientsJson: true,
      cfeJson: true,
    },
  });

  let updated = 0;
  let improved = 0;
  let unchanged = 0;

  for (const recipe of recipes) {
    const ingredients = parseStoredIngredients(
      JSON.parse(recipe.ingredientsJson || "[]"),
    );
    const rawCfe = JSON.parse(recipe.cfeJson || "null") as CfeData | null;
    if (!rawCfe) continue;

    const before = assessCfeQuality(rawCfe);

    const next =
      normalizeAndValidateCfe({ ingredients, cfe: rawCfe }) ??
      refineStoredCfe(rawCfe);

    if (!next) {
      if (PROTECTED.has(recipe.slug)) {
        console.log(`KEEP (protected): ${recipe.title}`);
        continue;
      }
      console.log(`SKIP (refine failed, kept): ${recipe.title}`);
      unchanged += 1;
      continue;
    }

    const after = assessCfeQuality(next);
    const same = JSON.stringify(next) === JSON.stringify(rawCfe);

    if (same) {
      unchanged += 1;
      continue;
    }

    updated += 1;
    if (after.maxColumn < before.maxColumn || after.emptyRatio < before.emptyRatio) {
      improved += 1;
    }

    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { cfeJson: JSON.stringify(next) },
    });

    console.log(
      `OK: ${recipe.title} | cols ${before.maxColumn}→${after.maxColumn} | empty ${(before.emptyRatio * 100).toFixed(0)}%→${(after.emptyRatio * 100).toFixed(0)}%`,
    );
  }

  console.log(
    JSON.stringify({ total: recipes.length, updated, improved, unchanged }, null, 2),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
