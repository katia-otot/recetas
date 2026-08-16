import { slugify } from "./slug";

export function haveIngredientsStorageKey(title: string): string {
  return `cfe-have:${slugify(title)}`;
}

export function readHaveIngredients(title: string): Set<string> {
  try {
    const raw = localStorage.getItem(haveIngredientsStorageKey(title));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function writeHaveIngredients(title: string, ids: Set<string>): void {
  try {
    localStorage.setItem(
      haveIngredientsStorageKey(title),
      JSON.stringify([...ids]),
    );
  } catch {
    // private mode / quota
  }
}
