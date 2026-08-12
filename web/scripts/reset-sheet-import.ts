import "../src/lib/load-env";
import { prisma } from "../src/lib/db";

async function main() {
  const recipes = await prisma.recipe.deleteMany({
    where: { sheetTab: "Cotidianas/fáciles" },
  });
  const batches = await prisma.importBatch.deleteMany({
    where: { sheetTab: "Cotidianas/fáciles" },
  });

  console.log({
    deletedRecipes: recipes.count,
    deletedBatches: batches.count,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
