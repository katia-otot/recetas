"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "@/lib/base-path";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function RecipeActions({
  slug,
  title,
  canEdit = true,
  canDelete = true,
  variant = "body",
}: {
  slug: string;
  title: string;
  canEdit?: boolean;
  canDelete?: boolean;
  variant?: "body" | "header";
}) {
  const router = useRouter();
  const isClient = useIsClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [confirmOpen]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(withBasePath(`/api/recetas/${slug}`), {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo borrar");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  const dialog =
    confirmOpen && isClient
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-recipe-title"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Cerrar"
              onClick={() => !deleting && setConfirmOpen(false)}
            />
            <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
              <h2
                id="delete-recipe-title"
                className="text-xl font-semibold text-stone-900"
              >
                ¿Estás segura?
              </h2>
              <p className="mt-2 break-words text-sm leading-relaxed text-stone-600">
                Vas a borrar{" "}
                <span className="font-medium text-stone-800">{title}</span>.
                Esta acción no se puede deshacer.
              </p>
              {error && (
                <p className="mt-2 text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  disabled={deleting}
                  className="min-h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="min-h-11 rounded-xl border border-red-600 bg-red-600 px-3 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "Borrando…" : "Sí, borrar"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (!canEdit && !canDelete) return null;

  if (variant === "header") {
    return (
      <>
        <div className="flex items-center gap-1">
          {canEdit && (
            <Link
              href={`/${slug}/editar`}
              className="inline-flex h-11 items-center rounded-full px-2.5 text-sm text-stone-700 hover:bg-stone-200/70 sm:px-3"
            >
              Editar
            </Link>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
              className="inline-flex h-11 items-center rounded-full px-2.5 text-sm text-red-700 hover:bg-red-50 sm:px-3 disabled:opacity-50"
            >
              Borrar
            </button>
          )}
        </div>
        {dialog}
      </>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <div
        className={`grid gap-2 sm:flex sm:w-auto ${
          canEdit && canDelete ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        {canEdit && (
          <Link
            href={`/${slug}/editar`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
          >
            Editar
          </Link>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Borrar
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {dialog}
    </div>
  );
}
