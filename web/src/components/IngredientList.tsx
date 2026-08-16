"use client";

import { useEffect, useMemo, useState } from "react";
import { cfeIngredientId } from "@/lib/cfe";
import {
  readHaveIngredients,
  writeHaveIngredients,
} from "@/lib/have-ingredients";
import {
  formatIngredient,
  ingredientHasMetric,
  type Ingredient,
  type UnitMode,
} from "@/lib/recipe-schema";

export function IngredientList({
  title,
  ingredients,
}: {
  title: string;
  ingredients: Ingredient[];
}) {
  const hasAnyMetric = useMemo(
    () => ingredients.some(ingredientHasMetric),
    [ingredients],
  );
  const [mode, setMode] = useState<UnitMode>("original");
  const [haveIds, setHaveIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setHaveIds(readHaveIngredients(title));
  }, [title]);

  function toggleHave(ingredientId: string) {
    setHaveIds((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) next.delete(ingredientId);
      else next.add(ingredientId);
      writeHaveIngredients(title, next);
      return next;
    });
  }

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-stone-900">Ingredientes</h2>
        {hasAnyMetric && (
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-stone-300 bg-white p-1 text-sm sm:inline-grid">
            <button
              type="button"
              onClick={() => setMode("original")}
              className={`min-h-10 rounded-lg px-3 py-1.5 ${
                mode === "original"
                  ? "bg-amber-600 text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => setMode("metric")}
              className={`min-h-10 rounded-lg px-3 py-1.5 ${
                mode === "metric"
                  ? "bg-amber-600 text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Gramos / ml
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-stone-500">
        Tocá un ingrediente para marcar que ya lo tenés.
      </p>

      <ul className="mt-4 space-y-2 text-sm leading-relaxed text-stone-700 sm:text-base">
        {ingredients.map((item, index) => {
          const id = cfeIngredientId(item.name, index);
          const label = formatIngredient(item, mode);
          const estimated =
            mode === "metric" && item.metricEstimated && ingredientHasMetric(item);
          const checked = haveIds.has(id);

          return (
            <li key={`${item.name}-${index}`}>
              <button
                type="button"
                onClick={() => toggleHave(id)}
                aria-pressed={checked}
                title={
                  checked
                    ? "Marcado: ya lo tenés (tocá para quitar)"
                    : "Tocá para marcar que ya lo tenés"
                }
                className={`flex w-full min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 text-left touch-manipulation transition-colors ${
                  checked
                    ? "border-green-500 bg-green-200 text-stone-900"
                    : "border-stone-200 bg-white hover:bg-stone-50"
                }`}
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    checked ? "bg-green-700" : "bg-amber-600"
                  }`}
                />
                <span>
                  {label}
                  {estimated ? (
                    <span className="ml-1 text-xs text-stone-500">(aprox.)</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {mode === "metric" && hasAnyMetric && (
        <p className="mt-3 text-xs leading-relaxed text-stone-500">
          Las equivalencias en g/ml las estima la IA. Si no hay conversión clara,
          se mantiene la medida original.
        </p>
      )}
    </div>
  );
}
