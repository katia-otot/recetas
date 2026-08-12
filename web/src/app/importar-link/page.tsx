"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";

export default function ImportLinkPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/importar-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo importar");
      router.push(`/recetas/${data.slug}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-10 sm:py-8">
        <h1 className="text-xl font-semibold text-stone-900 sm:text-2xl">
          Importar desde link
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-600 sm:text-base">
          Pegá el link de una receta en texto. La app la estructura con IA antes
          de guardarla (ingredientes, pasos y tabla Cooking for Engineers).
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4 sm:mt-8">
          <div>
            <label className="block text-sm font-medium text-stone-700" htmlFor="url">
              Link de la receta
            </label>
            <input
              id="url"
              type="url"
              required
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="min-h-11 w-full rounded-xl bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 sm:w-auto"
          >
            {loading ? "Extrayendo y estructurando…" : "Importar receta"}
          </button>
        </form>

        {error && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        )}
      </main>
    </>
  );
}
