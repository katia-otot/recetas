import "../src/lib/load-env";
import { prisma } from "../src/lib/db";
import { structureRecipeWithAi } from "../src/lib/structure-recipe";

async function main() {
  const title = process.argv.slice(2).join(" ").trim() || "Pasta caprese";
  const recipe = await prisma.recipe.findFirst({ where: { title } });
  if (!recipe) throw new Error(`No encontrada: ${title}`);

  await prisma.recipe.update({
    where: { id: recipe.id },
    data: {
      status: "importado",
      structureError: null,
      ingredientsJson: null,
      stepsJson: null,
      cfeJson: null,
      versionsJson: null,
    },
  });

  const started = Date.now();
  const result = await structureRecipeWithAi(recipe.id);
  console.log({
    title: result.structured.title,
    model: result.model,
    ms: Date.now() - started,
    ingredients: result.structured.ingredients.length,
    steps: result.structured.steps.length,
    versions: result.structured.versions?.length ?? 0,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
