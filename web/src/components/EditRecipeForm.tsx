"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";

type EditRecipeFormProps = {
  slug: string;
  title: string;
  ingredientsText: string;
  stepsText: string;
  extraNotes: string;
  tagsText: string;
  cuisinesText: string;
};

const fieldClass =
  "mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200";

export function EditRecipeForm(props: EditRecipeFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(props.title);
  const [ingredientsText, setIngredientsText] = useState(props.ingredientsText);
  const [stepsText, setStepsText] = useState(props.stepsText);
  const [extraNotes, setExtraNotes] = useState(props.extraNotes);
  const [tagsText, setTagsText] = useState(props.tagsText);
  const [cuisinesText, setCuisinesText] = useState(props.cuisinesText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/recetas/${props.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          ingredientsText,
          stepsText,
          extraNotes,
          tagsText,
          cuisinesText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      router.push(`/recetas/${data.slug}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-10 sm:py-8">
        <Link
          href={`/recetas/${props.slug}`}
          className="inline-flex min-h-11 items-center text-sm text-stone-500 hover:text-stone-800"
        >
          ← Volver a la receta
        </Link>

        <h1 className="mt-2 text-xl font-semibold text-stone-900 sm:mt-4 sm:text-2xl">
          Editar receta
        </h1>

        <form onSubmit={onSubmit} className="mt-6 space-y-5 sm:mt-8">
          <div>
            <label className="block text-sm font-medium text-stone-700" htmlFor="title">
              Título
            </label>
            <input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-stone-700"
              htmlFor="ingredients"
            >
              Ingredientes (uno por línea)
            </label>
            <textarea
              id="ingredients"
              rows={8}
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              className={`${fieldClass} font-mono text-sm`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700" htmlFor="steps">
              Pasos (uno por línea)
            </label>
            <textarea
              id="steps"
              rows={8}
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              className={`${fieldClass} font-mono text-sm`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700" htmlFor="notes">
              Notas personales
            </label>
            <textarea
              id="notes"
              rows={4}
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700" htmlFor="tags">
              Etiquetas (separadas por coma)
            </label>
            <input
              id="tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className={fieldClass}
              placeholder="pasta, fácil, ensalada"
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-stone-700"
              htmlFor="cuisines"
            >
              Estilos / cocinas (separados por coma)
            </label>
            <input
              id="cuisines"
              value={cuisinesText}
              onChange={(e) => setCuisinesText(e.target.value)}
              className={fieldClass}
              placeholder="italiana, mediterránea"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}

          <div className="sticky bottom-0 -mx-4 mt-2 grid grid-cols-1 gap-2 border-t border-stone-200 bg-stone-100/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-xl bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 sm:w-auto"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <Link
              href={`/recetas/${props.slug}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50 sm:w-auto"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </main>
    </>
  );
}
