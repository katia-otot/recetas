"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { RecipeVoteButtons } from "@/components/RecipeVoteButtons";
import type { RecipeVoteSummary } from "@/lib/recipe-votes";
import { AssignListsModal, type AssignableList } from "./AssignListsModal";
import { IconCheck, IconLabel, IconPlus } from "./icons";

export type BoardRecipe = {
  id: string;
  slug: string;
  title: string;
  preview: string | null;
  listIds: string[];
  hashtags: string[];
  vote: RecipeVoteSummary;
};

type RecipeBoardProps = {
  recipes: BoardRecipe[];
  lists: AssignableList[];
  activeListId: string;
  canEditActive: boolean;
};

export function RecipeBoard({
  recipes,
  lists,
  activeListId,
  canEditActive,
}: RecipeBoardProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const selectedIds = useMemo(() => [...selected], [selected]);

  function enterSelect(id: string) {
    setSelectMode(true);
    setSelected(new Set([id]));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectMode(false);
  }

  const initialListIds = useMemo(() => {
    if (selectedIds.length === 0) return [activeListId];
    const first = recipes.find((r) => r.id === selectedIds[0]);
    if (!first) return [activeListId];
    let common = new Set(first.listIds);
    for (const id of selectedIds.slice(1)) {
      const r = recipes.find((x) => x.id === id);
      if (!r) continue;
      common = new Set(r.listIds.filter((lid) => common.has(lid)));
    }
    if (common.size === 0) return [activeListId];
    return [...common];
  }, [selectedIds, recipes, activeListId]);

  if (recipes.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-stone-300 bg-white/70 px-6 py-10 text-center">
        <p className="text-stone-700">No hay recetas en esta lista.</p>
        <Link
          href={`/agregar?lista=${activeListId}`}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 font-medium text-amber-800 hover:underline"
        >
          <IconPlus className="h-4 w-4" />
          Agregar Receta
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {canEditActive ? (
          <Link
            href={`/agregar?lista=${activeListId}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-500 px-4 text-sm font-medium text-stone-900 hover:bg-amber-400"
          >
            <IconPlus className="h-5 w-5" />
            Agregar Receta
          </Link>
        ) : (
          <span />
        )}
        {canEditActive && selectMode && (
          <div className="flex h-10 items-center gap-2">
            <p className="text-sm text-stone-600">
              {selected.size === 0
                ? "Elegí recetas"
                : `${selected.size} seleccionada${selected.size === 1 ? "" : "s"}`}
            </p>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex h-10 items-center rounded-full px-3 text-sm text-stone-600 hover:bg-stone-200/70"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      <ul className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4">
        {recipes.map((recipe) => {
          const isSelected = selected.has(recipe.id);
          return (
            <li key={recipe.id} className="mb-3 break-inside-avoid">
              <div
                className={`relative rounded-xl border bg-white p-4 shadow-sm ${
                  isSelected
                    ? "border-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.45)]"
                    : "border-stone-200"
                }`}
              >
                {selectMode && (
                  <button
                    type="button"
                    onClick={() => toggle(recipe.id)}
                    className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-stone-300 bg-white shadow-sm"
                    aria-label={
                      isSelected ? "Quitar selección" : "Seleccionar receta"
                    }
                    aria-pressed={isSelected}
                  >
                    {isSelected && (
                      <IconCheck className="h-4 w-4 text-amber-700" />
                    )}
                  </button>
                )}

                {!selectMode && canEditActive && (
                  <button
                    type="button"
                    onClick={() => enterSelect(recipe.id)}
                    className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                    title="Seleccionar"
                    aria-label="Seleccionar receta"
                  >
                    <span className="h-4 w-4 rounded-full border border-current" />
                  </button>
                )}

                <Link
                  href={selectMode ? "#" : `/${recipe.slug}`}
                  onClick={(e) => {
                    if (selectMode) {
                      e.preventDefault();
                      toggle(recipe.id);
                    }
                  }}
                  className="block pr-8"
                >
                  <h2 className="text-base font-medium leading-snug text-stone-900">
                    {recipe.title}
                  </h2>
                  {recipe.preview && (
                    <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-stone-600">
                      {recipe.preview}
                    </p>
                  )}
                  {recipe.hashtags.length > 0 && (
                    <p className="mt-3 flex flex-wrap justify-end gap-x-2 gap-y-1 text-right text-xs font-medium text-amber-800/90">
                      {recipe.hashtags.map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </p>
                  )}
                </Link>
                <div className="mt-3 flex justify-end">
                  <RecipeVoteButtons
                    slug={recipe.slug}
                    initial={recipe.vote}
                    compact
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {selectMode && selected.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto mx-auto flex max-w-3xl items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-amber-500 px-4 text-sm font-medium text-stone-900 hover:bg-amber-400 sm:flex-none sm:px-6"
            >
              <IconLabel />
              Enviar a listas…
            </button>
          </div>
        </div>
      )}

      {assignOpen && (
        <AssignListsModal
          key={selectedIds.join(",")}
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          recipeIds={selectedIds}
          lists={lists}
          initialListIds={initialListIds}
          onDone={() => {
            clearSelection();
            router.refresh();
          }}
        />
      )}
    </>
  );
}
