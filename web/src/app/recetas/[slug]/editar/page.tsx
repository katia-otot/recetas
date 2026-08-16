import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  formatIngredient,
  parseStoredIngredients,
  type CfeData,
} from "@/lib/recipe-schema";
import { serializeCfeForEdit } from "@/lib/sync-recipe-formats";
import { EditRecipeForm } from "@/components/EditRecipeForm";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function EditRecipePage({ params }: PageProps) {
  const { slug } = await params;

  const recipe = await prisma.recipe.findUnique({ where: { slug } });
  if (!recipe) notFound();

  const ingredients = recipe.ingredientsJson
    ? parseStoredIngredients(JSON.parse(recipe.ingredientsJson))
    : [];
  const steps: string[] = recipe.stepsJson ? JSON.parse(recipe.stepsJson) : [];
  const tags: string[] = recipe.tagsJson ? JSON.parse(recipe.tagsJson) : [];
  const cuisines: string[] = recipe.cuisineJson
    ? JSON.parse(recipe.cuisineJson)
    : [];
  const cfe: CfeData | null = recipe.cfeJson
    ? JSON.parse(recipe.cfeJson)
    : null;
  const cfeEdit = serializeCfeForEdit(cfe);

  return (
    <EditRecipeForm
      slug={recipe.slug}
      title={recipe.title}
      ingredientsText={ingredients
        .map((item) => formatIngredient(item, "original"))
        .join("\n")}
      stepsText={steps.join("\n")}
      extraNotes={recipe.extraNotes ?? ""}
      tagsText={tags.join(", ")}
      cuisinesText={cuisines.join(", ")}
      cfePrepText={cfeEdit.prepText}
      cfeIngredientsText={cfeEdit.ingredientsText}
      cfeActionsText={cfeEdit.actionsText}
      cfeFinalText={cfeEdit.finalText}
      hasCfe={Boolean(cfe)}
    />
  );
}
