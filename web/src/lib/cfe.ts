import {
  formatIngredient,
  type CfeData,
  type Ingredient,
  type StructuredRecipe,
} from "./recipe-schema";
import { slugify } from "./slug";

export function cfeIngredientId(name: string, index: number): string {
  const base = slugify(name).replace(/-/g, "_");
  return base || `ing_${index + 1}`;
}

/** Filas CFE canónicas a partir de la lista principal de ingredientes. */
export function buildCfeIngredients(
  ingredients: Ingredient[],
): CfeData["ingredients"] {
  const used = new Set<string>();

  return ingredients.map((ing, index) => {
    let id = cfeIngredientId(ing.name, index);
    if (used.has(id)) id = `${id}_${index + 1}`;
    used.add(id);

    const metric = formatIngredient(ing, "metric");
    const original = formatIngredient(ing, "original");
    const label = metric !== original && (ing.grams || ing.ml) ? metric : original;

    return { id, label: label.trim() || ing.name };
  });
}

function hasLetter(text: string): boolean {
  return /\p{L}/u.test(text);
}

function idsOverlap(a: string[], b: string[]): boolean {
  const set = new Set(a);
  return b.some((id) => set.has(id));
}

export function formatCfeActionLabel(action: {
  verb: string;
  duration?: string;
}): string {
  const verb = action.verb.trim();
  const duration = action.duration?.trim();
  if (!duration) return verb;
  if (verb.toLowerCase().includes(duration.toLowerCase())) return verb;
  return `${verb} · ${duration}`;
}

/**
 * Columna = 1 + max(columnas de las que depende).
 * Misma columna solo si no hay dependencia (se pueden hacer en paralelo).
 */
const MERGE_VERB =
  /mezclar|incorporar|juntar|unir|combinar|agregar|servir|aliñar/i;
const COOK_VERB =
  /saltear|sofre[ií]r|hervir|hornear|asar|cocinar|fre[ií]r|tostar|dorar|rehogar|pochar|blanquear|reducir/i;

function isMergeVerb(verb: string): boolean {
  return MERGE_VERB.test(verb);
}

function isCookVerb(verb: string): boolean {
  return COOK_VERB.test(verb);
}

/** Un "mezclar todo" no puede ir antes de terminar de saltear/asar esas filas. */
function orderActionsForGraph(
  actions: CfeData["actions"],
): CfeData["actions"] {
  const result = [...actions];
  let changed = true;
  let guard = 0;
  while (changed && guard < 40) {
    changed = false;
    guard += 1;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const earlier = result[i];
        const later = result[j];
        if (!isMergeVerb(earlier.verb) || !isCookVerb(later.verb)) continue;
        const cookIsSubset = later.ingredientIds.every((id) =>
          earlier.ingredientIds.includes(id),
        );
        if (!cookIsSubset || later.ingredientIds.length === 0) continue;
        const [moved] = result.splice(i, 1);
        result.splice(j, 0, moved);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return result;
}

/**
 * Columna = 1 + max(columnas de las que depende).
 * Misma columna solo si no hay dependencia (se pueden hacer en paralelo).
 */
export function layoutActionGraph(
  actions: CfeData["actions"],
): CfeData["actions"] {
  if (actions.length === 0) return actions;

  const ordered = orderActionsForGraph(actions);

  const deps: number[][] = ordered.map((action, i) => {
    const explicit = (action.dependsOn ?? [])
      .map((n) => n - 1)
      .filter((j) => j >= 0 && j < i);
    const inferred: number[] = [];
    for (let j = 0; j < i; j++) {
      if (idsOverlap(action.ingredientIds, ordered[j].ingredientIds)) {
        inferred.push(j);
      }
    }
    // Nunca dejes que dependsOn de la IA ignore un stream que todavía no terminó.
    return [...new Set([...inferred, ...explicit])];
  });

  const columns = ordered.map(() => 1);
  for (let i = 0; i < ordered.length; i++) {
    if (deps[i].length === 0) {
      columns[i] = 1;
      continue;
    }
    columns[i] = 1 + Math.max(...deps[i].map((j) => columns[j]));
  }

  return ordered.map((action, i) => ({
    ...action,
    column: columns[i],
  }));
}

function normalizeId(value: string): string {
  return slugify(value).replace(/-/g, "_");
}

/**
 * Reescribe CFE con labels correctos y valida el árbol.
 * Si no es usable, devuelve null (la UI no muestra la pestaña).
 */
export function normalizeAndValidateCfe(
  structured: Pick<StructuredRecipe, "ingredients" | "cfe">,
): CfeData | null {
  const ingredients = buildCfeIngredients(structured.ingredients);
  if (ingredients.length === 0) return null;
  if (ingredients.some((ing) => !hasLetter(ing.label))) return null;

  const canonicalByNorm = new Map(
    ingredients.map((ing) => [normalizeId(ing.id), ing.id]),
  );
  for (const ing of ingredients) {
    const fromLabel = normalizeId(ing.label);
    if (fromLabel) canonicalByNorm.set(fromLabel, ing.id);
    const nameOnly = normalizeId(ing.label.replace(/^[\d½¼¾./\s]+/, ""));
    if (nameOnly) canonicalByNorm.set(nameOnly, ing.id);
  }

  // Mapear ids viejos del modelo → canónicos (por orden si coincide el largo).
  const aiIngredients = structured.cfe?.ingredients ?? [];
  const aiIdToCanonical = new Map<string, string>();
  if (aiIngredients.length === ingredients.length) {
    aiIngredients.forEach((ai, index) => {
      aiIdToCanonical.set(ai.id, ingredients[index].id);
      const norm = normalizeId(ai.id);
      if (norm) aiIdToCanonical.set(norm, ingredients[index].id);
    });
  }
  for (const ai of aiIngredients) {
    const byId = canonicalByNorm.get(normalizeId(ai.id));
    if (byId) aiIdToCanonical.set(ai.id, byId);
    const byLabel = canonicalByNorm.get(normalizeId(ai.label));
    if (byLabel) aiIdToCanonical.set(ai.id, byLabel);
  }

  const resolveIds = (ids: string[]): string[] => {
    const resolved: string[] = [];
    for (const raw of ids) {
      const direct = aiIdToCanonical.get(raw) ?? canonicalByNorm.get(normalizeId(raw));
      if (direct && !resolved.includes(direct)) resolved.push(direct);
    }
    return resolved;
  };

  const actions = layoutActionGraph(
    (structured.cfe?.actions ?? [])
      .map((action) => ({
        column: action.column,
        verb: action.verb.trim(),
        ingredientIds: resolveIds(action.ingredientIds),
        duration: action.duration,
        dependsOn: action.dependsOn,
      }))
      .filter(
        (action) =>
          action.verb &&
          action.ingredientIds.length > 0 &&
          !/^servir$/i.test(action.verb),
      ),
  );

  if (actions.length === 0) return null;

  const covered = new Set(actions.flatMap((a) => a.ingredientIds));
  if (covered.size !== ingredients.length) return null;

  const finalAction = structured.cfe?.finalAction ?? {
    verb: "Servir",
    tempC: null,
    tempF: null,
  };
  if (!finalAction.verb?.trim()) return null;

  return {
    prepRows: (structured.cfe?.prepRows ?? []).filter((line) =>
      hasLetter(line),
    ),
    ingredients,
    actions,
    finalAction: {
      verb: finalAction.verb.trim(),
      tempC: finalAction.tempC ?? null,
      tempF: finalAction.tempF ?? null,
      duration: finalAction.duration,
      notes: finalAction.notes,
    },
  };
}

export function isUsableCfe(cfe: CfeData | null | undefined): cfe is CfeData {
  if (!cfe) return false;
  if (cfe.ingredients.length === 0) return false;
  if (cfe.ingredients.some((ing) => !hasLetter(ing.label))) return false;
  if (cfe.actions.length === 0) return false;
  const ids = new Set(cfe.ingredients.map((i) => i.id));
  const actionsOk = cfe.actions.every(
    (action) =>
      action.verb.trim().length > 0 &&
      action.ingredientIds.length > 0 &&
      action.ingredientIds.every((id) => ids.has(id)),
  );
  if (!actionsOk) return false;

  const covered = new Set(cfe.actions.flatMap((a) => a.ingredientIds));
  return covered.size === cfe.ingredients.length;
}

/** Ensambla CFE con ingredientes fijos + actions del modelo. */
export function assembleCfe(input: {
  ingredients: CfeData["ingredients"];
  actions: CfeData["actions"];
  finalAction?: CfeData["finalAction"];
  prepRows?: string[];
}): CfeData | null {
  const idSet = new Set(input.ingredients.map((i) => i.id));
  const actions = layoutActionGraph(
    (input.actions ?? [])
      .map((action) => ({
        column: action.column,
        verb: action.verb.trim(),
        ingredientIds: [
          ...new Set(action.ingredientIds.filter((id) => idSet.has(id))),
        ],
        duration: action.duration,
        dependsOn: action.dependsOn,
      }))
      .filter(
        (action) =>
          action.verb &&
          action.ingredientIds.length > 0 &&
          !/^servir$/i.test(action.verb),
      ),
  );

  const cfe: CfeData = {
    prepRows: (input.prepRows ?? []).filter((line) => hasLetter(line)),
    ingredients: input.ingredients,
    actions,
    finalAction: {
      verb: (input.finalAction?.verb ?? "Servir").trim() || "Servir",
      tempC: input.finalAction?.tempC ?? null,
      tempF: input.finalAction?.tempF ?? null,
      duration: input.finalAction?.duration,
      notes: input.finalAction?.notes,
    },
  };

  return isUsableCfe(cfe) ? cfe : null;
}
