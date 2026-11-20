import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EditRecipeForm } from "@/components/EditRecipeForm";
import { KeepShell } from "@/components/keep/KeepShell";
import { signOutToLogin } from "@/lib/auth-actions";
import { prisma } from "@/lib/db";
import { loadKeepNav, resolveActiveListId } from "@/lib/keep-nav";
import { canEditRecipe, canViewRecipe } from "@/lib/lists";
import {
  formatIngredient,
  parseStoredIngredients,
  type CfeData,
} from "@/lib/recipe-schema";
import { requireUser } from "@/lib/session-user";
import { serializeCfeForEdit } from "@/lib/sync-recipe-formats";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function EditRecipePage({ params }: PageProps) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const session = await auth();
  const { slug } = await params;

  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: { lists: { select: { listId: true } } },
  });
  if (!recipe) notFound();
  if (!(await canViewRecipe(user.id, recipe.id))) notFound();
  if (!(await canEditRecipe(user.id, recipe.id))) {
    redirect(`/${recipe.slug}`);
  }

  const { lists, personalId } = await loadKeepNav(user.id);
  const activeListId = resolveActiveListId(
    lists,
    recipe.lists.map((item) => item.listId),
    personalId,
  );

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
    <KeepShell
      lists={lists}
      activeListId={activeListId}
      userImage={session?.user?.image}
      userLabel={session?.user?.name ?? session?.user?.email ?? "?"}
      signOutAction={signOutToLogin}
      headerTitle="Recetas"
      showMobileTitle={false}
    >
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
    </KeepShell>
  );
}
