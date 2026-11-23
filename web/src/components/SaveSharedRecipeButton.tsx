"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "@/lib/base-path";

type EditableList = {
  id: string;
  name: string;
  isDefault?: boolean;
  canEdit: boolean;
};

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function SaveSharedRecipeButton({
  token,
  isLoggedIn,
}: {
  token: string;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const isClient = useIsClient();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<EditableList[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function prepareShareCookie() {
    const res = await fetch(withBasePath(`/api/r/${token}`));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Link inválido");
    return data;
  }

  async function startSave() {
    setError(null);
    setBusy(true);
    try {
      await prepareShareCookie();

      if (!isLoggedIn) {
        const callback = encodeURIComponent(`/r/${token}`);
        router.push(`/login?callbackUrl=${callback}`);
        return;
      }

      const listsRes = await fetch(withBasePath("/api/listas"));
      const listsData = await listsRes.json();
      if (!listsRes.ok) {
        throw new Error(listsData.error ?? "No se pudieron cargar las listas");
      }

      const editable: EditableList[] = (listsData.lists ?? []).filter(
        (l: EditableList) => l.canEdit,
      );
      if (editable.length === 0) {
        throw new Error("No tenés listas donde guardar");
      }

      const personal = editable.find((l) => l.isDefault) ?? editable[0];
      setLists(editable);
      setSelected(new Set([personal.id]));
      setOpen(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmSave() {
    if (selected.size === 0) {
      setError("Marcá al menos una lista");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withBasePath(`/api/r/${token}/guardar`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      setSavedSlug(typeof data.slug === "string" ? data.slug : null);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dialog =
    open && isClient
      ? createPortal(
          <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
            <button
              type="button"
              className="absolute inset-0 bg-stone-900/40"
              aria-label="Cerrar"
              onClick={() => !busy && setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="save-shared-title"
              className="relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            >
              <div className="border-b border-stone-200 px-4 py-3">
                <h2
                  id="save-shared-title"
                  className="text-base font-medium text-stone-900"
                >
                  Guardar en mis listas
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  Elegí dónde guardarla. Personal queda marcada por defecto.
                </p>
              </div>

              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3">
                {lists.map((list) => (
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
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="min-h-11 flex-1 rounded-full border border-stone-300 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmSave}
                  disabled={busy}
                  className="min-h-11 flex-1 rounded-full bg-amber-500 text-sm font-medium text-stone-900 hover:bg-amber-400 disabled:opacity-50"
                >
                  {busy ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {savedSlug ? (
            <a
              href={withBasePath(`/${savedSlug}`)}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-amber-500 px-4 text-sm font-medium text-stone-900 hover:bg-amber-400"
            >
              Guardada — abrir en mi biblioteca
            </a>
          ) : (
            <button
              type="button"
              onClick={startSave}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-amber-500 px-4 text-sm font-medium text-stone-900 hover:bg-amber-400 disabled:opacity-60"
            >
              {busy
                ? "…"
                : isLoggedIn
                  ? "Guardar en mi biblioteca"
                  : "Entrar y guardar"}
            </button>
          )}
          {error && !open && (
            <p className="text-center text-xs text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      {dialog}
    </>
  );
}
