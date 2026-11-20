import { prisma } from "@/lib/db";
import { ensurePersonalList, getListAccessForUser } from "@/lib/lists";
import { uniqueSlug } from "@/lib/slug";
import { rebuildCfeFromClassic } from "@/lib/structure-recipe";
import type { Ingredient } from "@/lib/recipe-schema";

export type ManualRecipeResult = {
  recipeId: string;
  slug: string;
  title: string;
  status: string;
  hasCfe: boolean;
};

function linesToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseIngredientLines(text: string): Ingredient[] {
  return linesToList(text).map((line) => ({
    name: line,
    quantity: undefined,
    unit: undefined,
    prep: undefined,
    grams: undefined,
    ml: undefined,
    metricEstimated: undefined,
  }));
}

/**
 * Crea una receta a mano (título + ingredientes + pasos)
 * y pide a la IA la tabla Cooking for Engineers.
 */
export async function createManualRecipe(input: {
  title: string;
  ingredientsText: string;
  stepsText: string;
  userId: string;
  listId?: string;
  extraNotes?: string;
}): Promise<ManualRecipeResult> {
  const title = input.title.trim();
  if (!title) throw new Error("El título es obligatorio");

  const ingredients = parseIngredientLines(input.ingredientsText);
  const steps = linesToList(input.stepsText);

  if (ingredients.length === 0) {
    throw new Error("Agregá al menos un ingrediente");
  }
  if (steps.length === 0) {
    throw new Error("Agregá al menos un paso");
  }

  let targetListId = input.listId;
  if (targetListId) {
    const access = await getListAccessForUser(input.userId, targetListId);
    if (!access?.canEdit) {
      throw new Error("No tenés permiso para agregar a esa lista");
    }
  } else {
    targetListId = (await ensurePersonalList(input.userId)).id;
  }

  const slug = await uniqueSlug(title, async (candidate) => {
    const found = await prisma.recipe.findUnique({ where: { slug: candidate } });
    return found !== null;
  });

  const rawText = [
    `Título: ${title}`,
    "",
    "Ingredientes:",
    ...ingredients.map((i) => `- ${i.name}`),
    "",
    "Pasos:",
    ...steps.map((step, i) => `${i + 1}. ${step}`),
  ].join("\n");

  const recipe = await prisma.recipe.create({
    data: {
      title,
      slug,
      rawText,
      extraNotes: input.extraNotes?.trim() || null,
      ingredientsJson: JSON.stringify(ingredients),
      stepsJson: JSON.stringify(steps),
      ingredientIndex: JSON.stringify(
        ingredients.map((i) => i.name.toLowerCase()),
      ),
      tagsJson: "[]",
      cuisineJson: "[]",
      status: "procesando",
      createdById: input.userId,
      lists: {
        create: [{ listId: targetListId }],
      },
    },
  });

  try {
    const cfe = await rebuildCfeFromClassic({ title, ingredients, steps });
    const updated = await prisma.recipe.update({
      where: { id: recipe.id },
      data: {
        cfeJson: cfe ? JSON.stringify(cfe) : null,
        status: "estructurado",
        structureError: cfe
          ? null
          : "Se guardó la receta, pero no se pudo armar la tabla CFE",
      },
    });

    return {
      recipeId: updated.id,
      slug: updated.slug,
      title: updated.title,
      status: updated.status,
      hasCfe: Boolean(cfe),
    };
  } catch (error) {
    await prisma.recipe.update({
      where: { id: recipe.id },
      data: {
        status: "estructurado",
        structureError: (error as Error).message,
        cfeJson: null,
      },
    });

    return {
      recipeId: recipe.id,
      slug: recipe.slug,
      title: recipe.title,
      status: "estructurado",
      hasCfe: false,
    };
  }
}
