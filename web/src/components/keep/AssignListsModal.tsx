"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "@/lib/base-path";
import { IconClose } from "./icons";

export type AssignableList = {
  id: string;
  name: string;
  canEdit: boolean;
};

type AssignListsModalProps = {
  open: boolean;
  onClose: () => void;
  recipeIds: string[];
  lists: AssignableList[];
  /** Listas ya marcadas al abrir (ej. la lista actual). */
  initialListIds: string[];
  onDone: () => void;
};

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function AssignListsModal({
  open,
  onClose,
  recipeIds,
  lists,
  initialListIds,
  onDone,
}: AssignListsModalProps) {
  const isClient = useIsClient();
  const editable = lists.filter((l) => l.canEdit);
  const editableIds = new Set(editable.map((l) => l.id));
  const [selected, setSelected] = useState(
    () => new Set(initialListIds.filter((id) => editableIds.has(id))),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (selected.size === 0) {
      setError(
        "Marcá al menos una lista. Si sacás Personal y marcás otra, se mueve.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withBasePath("/api/recetas/asignar-listas"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeIds,
          listIds: [...selected],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar");
      onDone();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open || !isClient) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-stone-900/40"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-lists-title"
        className="relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
          <h2
            id="assign-lists-title"
            className="flex-1 text-base font-medium text-stone-900"
          >
            Enviar a listas
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-stone-100"
            aria-label="Cerrar"
          >
            <IconClose />
          </button>
        </div>

        <p className="px-4 pt-3 text-sm text-stone-600">
          Marcá dónde van a vivir. Solo la nueva = se mueven. Personal + nueva =
          quedan en las dos.
        </p>

        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {editable.map((list) => (
            <li key={list.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={selected.has(list.id)}
                  onChange={() => toggle(list.id)}
                  className="size-4 rounded border-stone-300 text-amber-600 focus:ring-amber-200"
                />
                <span className="text-sm text-stone-800">{list.name}</span>
              </label>
            </li>
          ))}
        </ul>

        {error && (
          <p className="px-4 pb-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2 border-t border-stone-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 flex-1 rounded-full border border-stone-300 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="min-h-11 flex-1 rounded-full bg-amber-500 text-sm font-medium text-stone-900 hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? "Guardando…" : `Aplicar (${recipeIds.length})`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
