"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/base-path";

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "").toLowerCase();
}

function asHashtag(value: string): string {
  const tag = normalizeTag(value);
  return tag ? `#${tag}` : "";
}

function uniqueTags(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const tag = normalizeTag(value);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** Hashtags de contenido (#). Distintos de las listas-carpeta. */
export function RecipeHashtags({
  slug,
  tags,
  cuisines,
  canEdit,
}: {
  slug: string;
  tags: string[];
  cuisines: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(() => uniqueTags([...cuisines, ...tags]));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(uniqueTags([...cuisines, ...tags]));
  }, [tags, cuisines]);

  async function save(next: string[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withBasePath(`/api/recetas/${slug}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagsText: next.join(", "),
          // Unificamos hashtags en tags; cocina deja de duplicarse como chip viejo
          cuisinesText: "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      setItems(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeTag(tag: string) {
    const next = items.filter((t) => t !== tag);
    await save(next);
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    const tag = normalizeTag(draft);
    if (!tag) return;
    if (items.includes(tag)) {
      setDraft("");
      return;
    }
    const next = [...items, tag];
    setDraft("");
    await save(next);
  }

  if (!canEdit && items.length === 0) return null;

  return (
    <section className="mt-8 border-t border-stone-200 pt-6">
      <h2 className="text-sm font-semibold text-stone-700">Hashtags</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {items.length === 0 && (
          <span className="text-sm text-stone-500">Sin hashtags</span>
        )}
        {items.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-950"
          >
            {asHashtag(tag)}
            {canEdit && (
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={busy}
                className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-800 hover:bg-amber-200 disabled:opacity-50"
                aria-label={`Quitar ${asHashtag(tag)}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>

      {canEdit && (
        <form onSubmit={addTag} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ej. especias o #mezcla"
            maxLength={40}
            disabled={busy}
            className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:opacity-50 sm:max-w-xs"
          />
          <button
            type="submit"
            disabled={busy || !normalizeTag(draft)}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
          >
            Agregar #
          </button>
        </form>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
