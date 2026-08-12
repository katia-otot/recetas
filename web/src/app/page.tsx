import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/SiteHeader";

type HomeProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const [recipes, pendingCount] = await Promise.all([
    prisma.recipe.findMany({
      where: {
        status: "estructurado",
        ...(query
          ? {
              OR: [
                { title: { contains: query } },
                { rawText: { contains: query } },
                { extraNotes: { contains: query } },
                { ingredientIndex: { contains: query } },
              ],
            }
          : {}),
      },
      orderBy: [{ title: "asc" }],
      include: { sources: { where: { isPrimary: true }, take: 1 } },
    }).then((rows) =>
      rows.filter((recipe) => {
        if (!recipe.ingredientsJson || !recipe.stepsJson) return false;
        try {
          const ingredients = JSON.parse(recipe.ingredientsJson);
          const steps = JSON.parse(recipe.stepsJson);
          return Array.isArray(ingredients) && ingredients.length > 0 && Array.isArray(steps) && steps.length > 0;
        } catch {
          return false;
        }
      }),
    ),
    prisma.recipe.count({
      where: { status: { in: ["importado", "procesando", "error_ia"] } },
    }),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 overflow-x-hidden px-4 py-6 pb-10 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl font-semibold text-stone-900 sm:text-2xl">
            Tu biblioteca
          </h1>
          <p className="mt-1 text-sm text-stone-600 sm:text-base">
            {recipes.length} receta{recipes.length === 1 ? "" : "s"} listas
            {query ? ` · “${query}”` : ""}
          </p>
          {pendingCount > 0 && (
            <p className="mt-2 text-sm text-amber-800">
              {pendingCount} sin estructurar todavía.
            </p>
          )}
        </div>

        <form className="mb-6 sm:mb-8" action="/" method="get">
          <label className="block text-sm font-medium text-stone-700" htmlFor="q">
            Buscar
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="q"
              name="q"
              type="search"
              enterKeyHint="search"
              defaultValue={query}
              placeholder="ej. garbanzos, tofu, pasta…"
              className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-stone-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
            <button
              type="submit"
              className="min-h-11 shrink-0 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-700 sm:w-auto"
            >
              Buscar
            </button>
          </div>
        </form>

        {recipes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center sm:p-8">
            <p className="text-stone-700">
              Todavía no hay recetas estructuradas para mostrar.
            </p>
            <Link
              href="/importar-link"
              className="mt-4 inline-flex min-h-11 items-center text-amber-700 hover:underline"
            >
              Importar desde un link
            </Link>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-stone-200 bg-white divide-y divide-stone-200">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <Link
                  href={`/recetas/${recipe.slug}`}
                  className="block px-4 py-4 active:bg-stone-100 sm:hover:bg-stone-50"
                >
                  <h2 className="text-base font-medium leading-snug text-stone-900">
                    {recipe.title}
                  </h2>
                  {recipe.rawText && (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone-600">
                      {recipe.rawText}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
