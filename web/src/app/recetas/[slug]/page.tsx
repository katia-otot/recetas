import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isUsableCfe } from "@/lib/cfe";
import {
  parseStoredIngredients,
  parseStoredVersions,
  type CfeData,
} from "@/lib/recipe-schema";
import { RecipeActions } from "@/components/RecipeActions";
import { RecipeFormatTabs } from "@/components/RecipeFormatTabs";
import { RecipeVersions } from "@/components/RecipeVersions";
import { SiteHeader } from "@/components/SiteHeader";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function RecipePage({ params }: PageProps) {
  const { slug } = await params;

  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: { sources: { orderBy: { isPrimary: "desc" } } },
  });

  if (!recipe) notFound();

  const steps = recipe.stepsJson ? JSON.parse(recipe.stepsJson) : null;
  const ingredients = recipe.ingredientsJson
    ? parseStoredIngredients(JSON.parse(recipe.ingredientsJson))
    : [];
  const parsedCfe: CfeData | null = recipe.cfeJson
    ? JSON.parse(recipe.cfeJson)
    : null;
  const cfe = isUsableCfe(parsedCfe) ? parsedCfe : null;
  const versions = recipe.versionsJson
    ? parseStoredVersions(JSON.parse(recipe.versionsJson))
    : [];
  const tags = recipe.tagsJson ? JSON.parse(recipe.tagsJson) : [];
  const cuisines = recipe.cuisineJson ? JSON.parse(recipe.cuisineJson) : [];

  const hasStructure = ingredients.length > 0 && Array.isArray(steps) && steps.length > 0;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl min-w-0 flex-1 overflow-x-hidden px-4 py-6 pb-10 sm:py-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm text-stone-500 hover:text-stone-800"
        >
          ← Volver
        </Link>

        <header className="mt-2 border-b border-stone-200 pb-5 sm:mt-4 sm:pb-6">
          <h1 className="text-2xl font-semibold leading-tight text-stone-900 sm:text-3xl">
            {recipe.title}
          </h1>
          {(tags.length > 0 || cuisines.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {cuisines.map((c: string) => (
                <span
                  key={c}
                  className="rounded-full bg-stone-200 px-2.5 py-1 text-xs text-stone-700"
                >
                  {c}
                </span>
              ))}
              {tags.map((t: string) => (
                <span
                  key={t}
                  className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <RecipeActions slug={recipe.slug} title={recipe.title} />
        </header>

        {recipe.status !== "estructurado" && !hasStructure && (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Esta receta aún no está estructurada. Estado actual: {recipe.status}.
          </p>
        )}

        {recipe.sources.length > 0 && (
          <section className="mt-6">
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
      </main>
    </>
  );
}
