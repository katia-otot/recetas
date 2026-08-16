"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";

type EditMode = "classic" | "cfe";

type EditRecipeFormProps = {
  slug: string;
  title: string;
  ingredientsText: string;
  stepsText: string;
  extraNotes: string;
  tagsText: string;
  cuisinesText: string;
  cfePrepText: string;
  cfeIngredientsText: string;
  cfeActionsText: string;
  cfeFinalText: string;
  hasCfe: boolean;
};

const fieldClass =
  "mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200";

export function EditRecipeForm(props: EditRecipeFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<EditMode>("classic");
  const [title, setTitle] = useState(props.title);
  const [ingredientsText, setIngredientsText] = useState(props.ingredientsText);
  const [stepsText, setStepsText] = useState(props.stepsText);
  const [extraNotes, setExtraNotes] = useState(props.extraNotes);
  const [tagsText, setTagsText] = useState(props.tagsText);
  const [cuisinesText, setCuisinesText] = useState(props.cuisinesText);
  const [cfePrepText, setCfePrepText] = useState(props.cfePrepText);
  const [cfeIngredientsText, setCfeIngredientsText] = useState(
    props.cfeIngredientsText,
  );
  const [cfeActionsText, setCfeActionsText] = useState(props.cfeActionsText);
  const [cfeFinalText, setCfeFinalText] = useState(props.cfeFinalText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const body =
        mode === "classic"
          ? {
              syncFrom: "classic",
              title,
              ingredientsText,
              stepsText,
              extraNotes,
              tagsText,
              cuisinesText,
            }
          : {
              syncFrom: "cfe",
              title,
              extraNotes,
              tagsText,
              cuisinesText,
              cfePrepText,
              cfeIngredientsText,
              cfeActionsText,
              cfeFinalText,
            };

      const res = await fetch(`/api/recetas/${props.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-stone-300 bg-white p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("classic")}
            className={`min-h-11 rounded-lg px-2 py-2 ${
              mode === "classic"
                ? "bg-amber-600 text-white"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Formato clásico
          </button>
          <button
            type="button"
            onClick={() => setMode("cfe")}
            className={`min-h-11 rounded-lg px-2 py-2 ${
              mode === "cfe"
                ? "bg-amber-600 text-white"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Tabla CFE
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-stone-500">
          {mode === "classic"
            ? "Si cambiás ingredientes o pasos, al guardar se regenera la tabla CFE."
            : "Si editás la CFE, al guardar se actualizan ingredientes y pasos del formato clásico."}
        </p>

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

          {mode === "classic" ? (
            <>
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
                <label
                  className="block text-sm font-medium text-stone-700"
                  htmlFor="steps"
                >
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
            </>
          ) : (
            <>
              {!props.hasCfe && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Esta receta todavía no tiene CFE. Podés crearla acá o guardar
                  desde el formato clásico para que se genere sola.
                </p>
              )}

              <div>
                <label
                  className="block text-sm font-medium text-stone-700"
                  htmlFor="cfe-prep"
                >
                  Prep (solo horno/equipo, uno por línea)
                </label>
                <textarea
                  id="cfe-prep"
                  rows={2}
                  value={cfePrepText}
                  onChange={(e) => setCfePrepText(e.target.value)}
                  className={`${fieldClass} font-mono text-sm`}
                  placeholder="Precalentar el horno a 180°C"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-stone-700"
                  htmlFor="cfe-ingredients"
                >
                  Ingredientes CFE (id | etiqueta)
                </label>
                <textarea
                  id="cfe-ingredients"
                  rows={8}
                  value={cfeIngredientsText}
                  onChange={(e) => setCfeIngredientsText(e.target.value)}
                  className={`${fieldClass} font-mono text-sm`}
                  placeholder={"pasta | 170 g pasta fusilli\naceite | aceite de oliva"}
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-stone-700"
                  htmlFor="cfe-actions"
                >
                  Acciones (Verbo | ids | duración | depends:1,2)
                </label>
                <textarea
                  id="cfe-actions"
                  rows={10}
                  value={cfeActionsText}
                  onChange={(e) => setCfeActionsText(e.target.value)}
                  className={`${fieldClass} font-mono text-sm`}
                  placeholder={
                    "1. Hervir | pasta | al dente\n2. Saltear | aceite,tomates | 3 min\n3. Mezclar | pasta,aceite,tomates | depends:1,2"
                  }
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-stone-700"
                  htmlFor="cfe-final"
                >
                  Acción final
                </label>
                <input
                  id="cfe-final"
                  value={cfeFinalText}
                  onChange={(e) => setCfeFinalText(e.target.value)}
                  className={fieldClass}
                  placeholder="Servir | inmediatamente"
                />
              </div>
            </>
          )}

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
              {saving
                ? mode === "classic"
                  ? "Guardando y regenerando CFE…"
                  : "Guardando y actualizando clásico…"
                : "Guardar cambios"}
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
