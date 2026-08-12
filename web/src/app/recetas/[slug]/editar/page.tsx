import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  formatIngredient,
  parseStoredIngredients,
} from "@/lib/recipe-schema";
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
    />
  );
}
