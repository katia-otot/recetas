import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { KeepShell } from "@/components/keep/KeepShell";
import { RecipeFormatTabs } from "@/components/RecipeFormatTabs";
import { RecipeHashtags } from "@/components/RecipeHashtags";
import { RecipeVoteButtons } from "@/components/RecipeVoteButtons";
import { RecipeListsEditor } from "@/components/RecipeListsEditor";
import { RecipeVersions } from "@/components/RecipeVersions";
import { signOutToLogin } from "@/lib/auth-actions";
import { isUsableCfe, refineStoredCfe } from "@/lib/cfe";
import { prisma } from "@/lib/db";
import { loadKeepNav, resolveActiveListId } from "@/lib/keep-nav";
import {
  canDeleteRecipe,
  canEditRecipe,
  canViewRecipe,
} from "@/lib/lists";
import {
  parseStoredIngredients,
  parseStoredVersions,
  type CfeData,
} from "@/lib/recipe-schema";
import { summarizeRecipeVotes } from "@/lib/recipe-votes";
import { requireUser } from "@/lib/session-user";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function RecipePage({ params }: PageProps) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const session = await auth();
  const { slug } = await params;

  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: {
      sources: { orderBy: { isPrimary: "desc" } },
      lists: { select: { listId: true } },
      votes: { select: { userId: true, value: true } },
    },
  });

  if (!recipe) notFound();
  if (!(await canViewRecipe(user.id, recipe.id))) notFound();

  const canEdit = await canEditRecipe(user.id, recipe.id);
  const canDelete = await canDeleteRecipe(user.id, recipe.id);

  const { lists, personalId } = await loadKeepNav(user.id);

  const activeListId = resolveActiveListId(
    lists,
    recipe.lists.map((item) => item.listId),
    personalId,
  );

  const recipeListIds = new Set(recipe.lists.map((item) => item.listId));

  const steps = recipe.stepsJson ? JSON.parse(recipe.stepsJson) : null;
  const ingredients = recipe.ingredientsJson
    ? parseStoredIngredients(JSON.parse(recipe.ingredientsJson))
    : [];
  const parsedCfe: CfeData | null = recipe.cfeJson
    ? JSON.parse(recipe.cfeJson)
    : null;
  const cfe =
    refineStoredCfe(parsedCfe) ?? (isUsableCfe(parsedCfe) ? parsedCfe : null);
  const versions = recipe.versionsJson
    ? parseStoredVersions(JSON.parse(recipe.versionsJson))
    : [];
  const tags: string[] = recipe.tagsJson ? JSON.parse(recipe.tagsJson) : [];
  const cuisines: string[] = recipe.cuisineJson
    ? JSON.parse(recipe.cuisineJson)
    : [];

  const hasStructure =
    ingredients.length > 0 && Array.isArray(steps) && steps.length > 0;

  return (
    <KeepShell
      lists={lists}
      activeListId={activeListId}
      userImage={session?.user?.image}
      userLabel={session?.user?.name ?? session?.user?.email ?? "?"}
      signOutAction={signOutToLogin}
      headerTitle={recipe.title}
      hideSearch
      showMobileTitle={false}
      backHref={`/?lista=${activeListId}`}
      recipeDetail={{
        slug: recipe.slug,
        title: recipe.title,
        canEdit,
        canDelete,
      }}
    >
      <div className="mx-auto w-full max-w-3xl min-w-0">
        <div className="mb-6">
          <RecipeVoteButtons
            slug={recipe.slug}
            initial={summarizeRecipeVotes(recipe.votes, user.id)}
          />
        </div>

        {recipe.status !== "estructurado" && !hasStructure && (
          <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Esta receta aún no está estructurada. Estado actual: {recipe.status}.
          </p>
        )}

        {recipe.sources.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
              Enlaces
            </h2>
            <ul className="mt-2 space-y-2">
              {recipe.sources.map((source) => (
                <li key={source.id}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block max-w-full break-all text-sm text-amber-800 hover:underline [overflow-wrap:anywhere]"
                  >
                    {source.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <RecipeFormatTabs
          title={recipe.title}
          ingredients={ingredients}
          steps={steps}
          cfe={cfe}
        />

        <RecipeVersions versions={versions} />

        {recipe.extraNotes && (
          <section className="mt-8 min-w-0">
            <h2 className="text-lg font-semibold text-stone-900">
              Notas personales
            </h2>
            <div className="mt-3 max-w-full overflow-hidden rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm leading-relaxed break-words whitespace-pre-wrap text-stone-700 [overflow-wrap:anywhere] sm:text-base">
              {recipe.extraNotes}
            </div>
          </section>
        )}

        <RecipeListsEditor
          recipeId={recipe.id}
          lists={lists.map((list) => ({
            id: list.id,
            name: list.name,
            canEdit: list.canEdit,
            checked: recipeListIds.has(list.id),
          }))}
        />

        <RecipeHashtags
          slug={recipe.slug}
          tags={tags}
          cuisines={cuisines}
          canEdit={canEdit}
        />

        {recipe.rawText && (
          <section className="mt-8 min-w-0">
            <h2 className="text-lg font-semibold text-stone-900">
              Texto original
            </h2>
            <div className="mt-3 max-w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm leading-relaxed break-words whitespace-pre-wrap text-stone-700 [overflow-wrap:anywhere] sm:text-base">
              {recipe.rawText}
            </div>
          </section>
        )}
      </div>
    </KeepShell>
  );
}
