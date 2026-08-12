"use client";

import { useMemo, useState } from "react";
import {
  formatIngredient,
  ingredientHasMetric,
  type Ingredient,
  type UnitMode,
} from "@/lib/recipe-schema";

export function IngredientList({ ingredients }: { ingredients: Ingredient[] }) {
  const hasAnyMetric = useMemo(
    () => ingredients.some(ingredientHasMetric),
    [ingredients],
  );
  const [mode, setMode] = useState<UnitMode>("original");

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

      <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-stone-700 sm:text-base">
        {ingredients.map((item, index) => {
          const label = formatIngredient(item, mode);
          const estimated =
            mode === "metric" && item.metricEstimated && ingredientHasMetric(item);
          return (
            <li
              key={`${item.name}-${index}`}
              className="flex gap-3 border-b border-stone-100 pb-2.5 last:border-0 last:pb-0"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
              <span>
                {label}
                {estimated ? (
                  <span className="ml-1 text-xs text-stone-400">(aprox.)</span>
                ) : null}
              </span>
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
