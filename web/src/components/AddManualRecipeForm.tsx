"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

const fieldClass =
  "mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200";

export function AddManualRecipeForm({ listId }: { listId?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withBasePath("/api/agregar-manual"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          ingredientsText,
          stepsText,
          extraNotes,
          listId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear");
      router.push(`/${data.slug}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 sm:mt-8">
      <div>
        <label className="block text-sm font-medium text-stone-700" htmlFor="title">
          Título
        </label>
        <input
          id="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ej. Pasta al pesto"
          maxLength={120}
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
          required
          rows={8}
          value={ingredientsText}
          onChange={(e) => setIngredientsText(e.target.value)}
          placeholder={"200 g pasta\n1 diente de ajo\nAlbahaca al gusto"}
          className={`${fieldClass} min-h-40 resize-y`}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700" htmlFor="steps">
          Pasos (uno por línea)
        </label>
        <textarea
          id="steps"
          required
          rows={8}
          value={stepsText}
          onChange={(e) => setStepsText(e.target.value)}
          placeholder={
            "Hervir la pasta al dente\nPisar el ajo con albahaca y aceite\nMezclar y servir"
          }
          className={`${fieldClass} min-h-40 resize-y`}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700" htmlFor="notes">
          Notas (opcional)
        </label>
        <textarea
          id="notes"
          rows={3}
          value={extraNotes}
          onChange={(e) => setExtraNotes(e.target.value)}
          placeholder="Probé con nueces en vez de piñones…"
          className={`${fieldClass} min-h-24 resize-y`}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="min-h-11 w-full rounded-xl bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 sm:w-auto"
      >
        {loading
          ? "Guardando y armando CFE con IA…"
          : "Guardar y generar CFE"}
      </button>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}
    </form>
  );
}
