"use client";

import { useState } from "react";
import { isUsableCfe } from "@/lib/cfe";
import type { CfeData, Ingredient } from "@/lib/recipe-schema";
import { CfeTable } from "@/components/CfeTable";
import { IngredientList } from "@/components/IngredientList";

type FormatTab = "basica" | "cfe";

export function RecipeFormatTabs({
  title,
  ingredients,
  steps,
  cfe,
}: {
  title: string;
  ingredients: Ingredient[];
  steps: string[] | null;
  cfe: CfeData | null;
}) {
  const hasBasic = ingredients.length > 0 || (steps && steps.length > 0);
  const usableCfe = isUsableCfe(cfe) ? cfe : null;
  const hasCfe = Boolean(usableCfe);
  const [tab, setTab] = useState<FormatTab>(hasBasic ? "basica" : "cfe");

  if (!hasBasic && !hasCfe) return null;

  return (
    <section className="mt-6 min-w-0 max-w-full sm:mt-8">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-stone-300 bg-white p-1 text-sm">
        {hasBasic && (
          <button
            type="button"
            onClick={() => setTab("basica")}
            className={`min-h-11 rounded-lg px-2 py-2 leading-tight sm:px-3 ${
              tab === "basica"
                ? "bg-amber-600 text-white"
                : "text-stone-600 hover:text-stone-900"
            } ${!hasCfe ? "col-span-2" : ""}`}
          >
            <span className="sm:hidden">Clásica</span>
            <span className="hidden sm:inline">Ingredientes y pasos</span>
          </button>
        )}
        {hasCfe && (
          <button
            type="button"
            onClick={() => setTab("cfe")}
            className={`min-h-11 rounded-lg px-2 py-2 leading-tight sm:px-3 ${
              tab === "cfe"
                ? "bg-amber-600 text-white"
                : "text-stone-600 hover:text-stone-900"
            } ${!hasBasic ? "col-span-2" : ""}`}
          >
            <span className="sm:hidden">CFE</span>
            <span className="hidden sm:inline">Cooking for Engineers</span>
          </button>
        )}
      </div>

      {tab === "basica" && hasBasic && (
        <div className="mt-2">
          {ingredients.length > 0 && (
            <IngredientList ingredients={ingredients} />
          )}
          {steps && steps.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-stone-900">Pasos</h2>
              <ol className="mt-3 list-decimal space-y-4 pl-5 text-sm leading-relaxed text-stone-700 sm:text-base">
                {steps.map((step) => (
                  <li key={step} className="pl-1">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {tab === "cfe" && usableCfe && (
        <div className="mt-4 sm:mt-6">
          <CfeTable cfe={usableCfe} title={title} />
        </div>
      )}
    </section>
  );
}
