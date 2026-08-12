import "../src/lib/load-env";
import { prisma } from "../src/lib/db";

async function main() {
  const title = process.argv.slice(2).join(" ").trim();
  if (!title) throw new Error("Indica el título de la receta");

  const recipe = await prisma.recipe.findFirst({ where: { title } });
  if (!recipe) throw new Error(`No se encontró: ${title}`);

  await prisma.recipe.update({
    where: { id: recipe.id },
    data: {
      status: "importado",
      ingredientsJson: null,
      stepsJson: null,
      cfeJson: null,
      versionsJson: null,
      ingredientIndex: null,
      tagsJson: null,
      cuisineJson: null,
      structureError: null,
    },
  });

  console.log(`Marcada para reprocesar: ${title}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
