"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "@/lib/base-path";
import { IconClose, IconLabel } from "@/components/keep/icons";

type ListOption = {
  id: string;
  name: string;
  canEdit: boolean;
  checked: boolean;
};

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Listas = carpetas del menú lateral (como etiquetas de Keep). No son hashtags. */
export function RecipeListsEditor({
  recipeId,
  lists,
}: {
  recipeId: string;
  lists: ListOption[];
}) {
  const router = useRouter();
  const isClient = useIsClient();
  const [items, setItems] = useState(lists);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(lists);
  }, [lists]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const selected = items.filter((l) => l.checked);
  const canEditAny = items.some((l) => l.canEdit);

  async function toggle(list: ListOption) {
    if (!list.canEdit) return;
    setBusyId(list.id);
    setError(null);
    const nextChecked = !list.checked;
    try {
      const res = await fetch(
        withBasePath(
          nextChecked
            ? `/api/listas/${list.id}/recetas`
            : `/api/listas/${list.id}/recetas/${recipeId}`,
        ),
        nextChecked
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ recipeId }),
            }
          : { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar");
      setItems((prev) =>
        prev.map((item) =>
          item.id === list.id ? { ...item, checked: nextChecked } : item,
        ),
      );
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) return null;

  const dialog =
    open && isClient
      ? createPortal(
          <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
            <button
              type="button"
              className="absolute inset-0 bg-stone-900/40"
              aria-label="Cerrar"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="recipe-lists-title"
              className="relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            >
              <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
                <IconLabel className="h-5 w-5 text-stone-600" />
                <h2
                  id="recipe-lists-title"
                  className="flex-1 text-base font-medium text-stone-900"
                >
                  Listas
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-stone-100"
                  aria-label="Cerrar"
                >
                  <IconClose />
                </button>
              </div>
              <p className="px-4 pt-3 text-sm text-stone-600">
                Carpetas del menú. No son hashtags (#).
              </p>
              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3">
                {items.map((list) => (
                  <li key={list.id}>
                    <label
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 hover:bg-stone-50 ${
                        list.canEdit ? "text-stone-800" : "text-stone-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={list.checked}
                        disabled={!list.canEdit || busyId === list.id}
                        onChange={() => toggle(list)}
                        className="size-4 rounded border-stone-300 text-amber-600 focus:ring-amber-200"
                      />
                      <span className="text-sm">{list.name}</span>
                      {!list.canEdit && (
                        <span className="text-xs">(solo lectura)</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
              {error && (
                <p className="px-4 pb-2 text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}
              <div className="border-t border-stone-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-amber-500 text-sm font-medium text-stone-900 hover:bg-amber-400"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <section className="mt-8 border-t border-stone-200 pt-6">
      <div className="flex items-center gap-2">
        <IconLabel className="h-4 w-4 text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-700">Listas</h2>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {selected.length === 0 ? (
          <span className="text-sm text-stone-500">Sin listas</span>
        ) : (
          selected.map((list) => (
            <span
              key={list.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1 text-sm text-stone-700"
            >
              <IconLabel className="h-3.5 w-3.5 text-stone-400" />
              {list.name}
            </span>
          ))
        )}
        {canEditAny && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-9 items-center rounded-full border border-dashed border-stone-300 px-3 text-sm text-stone-600 hover:bg-stone-100"
          >
            Editar listas…
          </button>
        )}
      </div>
      {dialog}
    </section>
  );
}
