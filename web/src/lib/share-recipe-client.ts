import { withBasePath } from "@/lib/base-path";

/** Pide (o reusa) el link público de una sola receta. */
export async function resolvePublicRecipeShareUrl(slug: string): Promise<string> {
  const res = await fetch(withBasePath(`/api/recetas/${slug}/compartir`), {
    method: "POST",
  });
  const data = await res.json();
  if (!res.ok || typeof data.path !== "string") {
    throw new Error(data.error ?? "No se pudo crear el link");
  }
  const path = data.path.startsWith("/") ? data.path : `/${data.path}`;
  if (typeof window === "undefined") return withBasePath(path);
  return `${window.location.origin}${withBasePath(path)}`;
}
