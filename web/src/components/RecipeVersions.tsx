import type { RecipeVersionStored } from "@/lib/recipe-schema";

export function RecipeVersions({
  versions,
}: {
  versions: RecipeVersionStored[];
  recipeTitle?: string;
}) {
  if (versions.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-stone-900">
        Otras pruebas / cambios
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        Solo lo que cambió respecto a la receta de arriba.
      </p>

      <ul className="mt-4 space-y-3">
        {versions.map((version) => (
          <li
            key={version.label}
            className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
          >
            <h3 className="font-medium text-stone-900">{version.label}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-700">
              {version.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
