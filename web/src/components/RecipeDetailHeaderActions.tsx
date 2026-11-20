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

function recipeUrl(slug: string): string {
  if (typeof window === "undefined") return withBasePath(`/${slug}`);
  return `${window.location.origin}${withBasePath(`/${slug}`)}`;
}

const actionClass =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-full px-3 text-sm leading-none";

export function RecipeDetailHeaderActions({
  slug,
  title,
  canEdit,
  canDelete,
}: {
  slug: string;
  title: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const isClient = useIsClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareLabel, setShareLabel] = useState("Compartir");

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
    try {
      const res = await fetch(withBasePath(`/api/recetas/${slug}`), {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo borrar");
      router.push("/");
      router.refresh();
    } catch {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  async function share() {
    const url = recipeUrl(slug);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text: title, url });
        return;
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareLabel("Copiado");
      setTimeout(() => setShareLabel("Compartir"), 2000);
    } catch {
      // ignore
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
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                Vas a borrar{" "}
                <span className="font-medium text-stone-800">{title}</span>.
                Esta acción no se puede deshacer.
              </p>
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

  return (
    <>
      <div className="flex shrink-0 items-center gap-0.5">
        {canEdit && (
          <Link
            href={`/${slug}/editar`}
            className={`${actionClass} text-stone-700 hover:bg-stone-200/70`}
          >
            Editar
          </Link>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
            className={`${actionClass} text-red-700 hover:bg-red-50 disabled:opacity-50`}
          >
            Borrar
          </button>
        )}
        <button
          type="button"
          onClick={share}
          className={`${actionClass} gap-1.5 text-stone-700 hover:bg-stone-200/70`}
          aria-label="Compartir link de la receta"
          title="Compartir link de la receta"
        >
          <ShareIcon />
          <span className="hidden sm:inline">{shareLabel}</span>
        </button>
      </div>
      {dialog}
    </>
  );
}

function ShareIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18 16.1c-.8 0-1.5.3-2 .9l-7.1-3.3c.1-.3.1-.5.1-.7s0-.4-.1-.7L15.9 8c.6.5 1.3.8 2.1.8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .4.1.7L8.1 9.8C7.5 9.3 6.8 9 6 9c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2.1-.8l7.1 3.3c-.1.2-.1.4-.1.7 0 1.7 1.3 3 3 3s3-1.3 3-3-1.3-3-3-3z" />
    </svg>
  );
}
