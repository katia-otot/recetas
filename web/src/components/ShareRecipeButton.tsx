"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

function recipeUrl(slug: string): string {
  if (typeof window === "undefined") return withBasePath(`/${slug}`);
  return `${window.location.origin}${withBasePath(`/${slug}`)}`;
}

function ShareIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18 16.1c-.8 0-1.5.3-2 .9l-7.1-3.3c.1-.3.1-.5.1-.7s0-.4-.1-.7L15.9 8c.6.5 1.3.8 2.1.8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .4.1.7L8.1 9.8C7.5 9.3 6.8 9 6 9c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2.1-.8l7.1 3.3c-.1.2-.1.4-.1.7 0 1.7 1.3 3 3 3s3-1.3 3-3-1.3-3-3-3z" />
    </svg>
  );
}

export function ShareRecipeButton({
  slug,
  title,
  variant = "button",
}: {
  slug: string;
  title: string;
  /** `header` = ícono en el encabezado, como Compartir de listas. */
  variant?: "button" | "header";
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function share() {
    const url = recipeUrl(slug);
    setStatus("idle");

    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({ title, text: title, url });
        return;
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  if (variant === "header") {
    return (
      <button
        type="button"
        onClick={share}
        className="inline-flex h-11 items-center gap-1.5 rounded-full px-2.5 text-stone-700 hover:bg-stone-200/70 sm:px-3"
        title={status === "copied" ? "Link copiado" : "Compartir link de la receta"}
        aria-label="Compartir link de la receta"
      >
        <ShareIcon className="h-5 w-5" />
        <span className="hidden text-sm sm:inline">
          {status === "copied" ? "Copiado" : "Compartir"}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={share}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
        aria-label="Compartir link de la receta"
      >
        <ShareIcon />
        {status === "copied" ? "Link copiado" : "Compartir link"}
      </button>
      {status === "error" && (
        <p className="text-xs text-red-700" role="alert">
          No se pudo copiar. Copiá la URL del navegador.
        </p>
      )}
    </div>
  );
}
