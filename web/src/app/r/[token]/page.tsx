import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { RecipeFormatTabs } from "@/components/RecipeFormatTabs";
import { RecipeVersions } from "@/components/RecipeVersions";
import { SaveSharedRecipeButton } from "@/components/SaveSharedRecipeButton";
import { isUsableCfe, refineStoredCfe } from "@/lib/cfe";
import { withBasePath } from "@/lib/base-path";
import {
  parseStoredIngredients,
  parseStoredVersions,
  type CfeData,
} from "@/lib/recipe-schema";
import { findActiveShareByToken } from "@/lib/recipe-share";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function SharedRecipePage({ params }: PageProps) {
  const { token } = await params;
  const share = await findActiveShareByToken(token);
  if (!share) notFound();

  const session = await auth();
  const isLoggedIn = !!session?.user;

  const recipe = share.recipe;
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
  const hashtags = [...new Set([...cuisines, ...tags].map((t) => t.trim()).filter(Boolean))];

  const hasStructure =
    ingredients.length > 0 && Array.isArray(steps) && steps.length > 0;

  return (
    <main className="min-h-full bg-[#f8f9fa]">
      <header className="border-b border-stone-200 bg-white/90">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={withBasePath("/icon-512.png")}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
              Receta compartida
            </p>
            <h1 className="truncate text-lg font-semibold text-stone-900">
              {recipe.title}
            </h1>
          </div>
          {!isLoggedIn && (
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(`/r/${token}`)}`}
              className="inline-flex h-10 shrink-0 items-center rounded-full px-3 text-sm text-stone-700 hover:bg-stone-100"
            >
              Entrar
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl min-w-0 px-4 py-6 pb-28">
        {recipe.status !== "estructurado" && !hasStructure && (
          <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Esta receta aún no está estructurada.
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
            <h2 className="text-lg font-semibold text-stone-900">Notas</h2>
            <div className="mt-3 max-w-full overflow-hidden rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm leading-relaxed break-words whitespace-pre-wrap text-stone-700 [overflow-wrap:anywhere] sm:text-base">
              {recipe.extraNotes}
            </div>
          </section>
        )}

        {hashtags.length > 0 && (
          <p className="mt-8 flex flex-wrap gap-x-2 gap-y-1 text-sm font-medium text-amber-800/90">
            {hashtags.map((tag) => (
              <span key={tag}>#{tag.replace(/^#+/, "").toLowerCase()}</span>
            ))}
          </p>
        )}

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

      <SaveSharedRecipeButton token={token} isLoggedIn={isLoggedIn} />
    </main>
  );
}
