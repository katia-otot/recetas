import {
  formatIngredient,
  type CfeData,
  type Ingredient,
  type StructuredRecipe,
} from "./recipe-schema";
import { slugify } from "./slug";

type CfeAction = CfeData["actions"][number];

/** Sin límite duro de columnas: recetas complejas pueden necesitar más. */

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

function unionIds(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
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

const MERGE_VERB =
  /mezclar|incorporar|juntar|unir|combinar|agregar|servir|aliñar/i;
const COOK_VERB =
  /saltear|sofre[ií]r|hervir|hornear|asar|cocinar|fre[ií]r|tostar|dorar|rehogar|pochar|blanquear|reducir|gratinar|pincelar|sellad/i;
const PREP_VERB =
  /\b(cortar|picar|salar|secar|reposar|lavar|pelar|desvenar|escurrir|partir|rebanar|laminar|filetear|trocear|desmenuzar|marinar|desalgar|escaldar|enjuagar)\b/i;
const MICRO_VERB =
  /\b(dar la vuelta|dar vuelta|voltear|girar|retornar)\b/i;
const ASSEMBLE_VERB = /\b(cubrir|armar|rellenar|colocar|montar|disponer)\b/i;

function isMergeVerb(verb: string): boolean {
  return MERGE_VERB.test(verb);
}

function isCookVerb(verb: string): boolean {
  return COOK_VERB.test(verb);
}

function isPrepVerb(verb: string): boolean {
  return PREP_VERB.test(verb) && !COOK_VERB.test(verb);
}

function isMicroVerb(verb: string): boolean {
  return MICRO_VERB.test(verb);
}

function isAssembleVerb(verb: string): boolean {
  return ASSEMBLE_VERB.test(verb);
}

function isGraphVerb(verb: string): boolean {
  return (
    isCookVerb(verb) ||
    isMergeVerb(verb) ||
    isAssembleVerb(verb) ||
    isPrepVerb(verb)
  );
}

function parseDurationMinutes(duration?: string): number | null {
  if (!duration) return null;
  const range = duration.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const single = duration.match(/(\d+)/);
  return single ? Number(single[1]) : null;
}

function formatDurationMinutes(total: number): string {
  if (total <= 0) return "";
  if (Math.abs(total - Math.round(total)) < 0.01) {
    return `${Math.round(total)} min`;
  }
  return `${total} min`;
}

function combineDuration(a?: string, b?: string): string | undefined {
  const ma = parseDurationMinutes(a);
  const mb = parseDurationMinutes(b);
  if (ma != null && mb != null) {
    return formatDurationMinutes(ma + mb);
  }
  if (a && b && a !== b) return `${a} + ${b}`;
  return a ?? b;
}

/** Corrige dependsOn inválidos (auto-referencia, índices futuros). */
export function sanitizeDependsOn(actions: CfeAction[]): CfeAction[] {
  return actions.map((action, index) => {
    const maxPrev = index;
    const deps = [
      ...new Set(
        (action.dependsOn ?? []).filter(
          (n) => Number.isInteger(n) && n >= 1 && n <= maxPrev,
        ),
      ),
    ];
    return {
      ...action,
      dependsOn: deps.length > 0 ? deps : undefined,
    };
  });
}

/**
 * Ordena filas de ingredientes para que las que comparten acciones queden juntas.
 * Así el rowspan de CFE agrupa bien (berenjena+aceite, no toda la lista).
 */
export function reorderIngredientsForActions(
  ingredients: CfeData["ingredients"],
  actions: CfeAction[],
): CfeData["ingredients"] {
  if (ingredients.length <= 1 || actions.length === 0) return ingredients;

  const byId = new Map(ingredients.map((ing) => [ing.id, ing]));
  const known = new Set(byId.keys());
  const firstCol = new Map<string, number>();
  const lastCol = new Map<string, number>();
  const coCount = new Map<string, Map<string, number>>();

  const bump = (a: string, b: string) => {
    if (a === b) return;
    if (!coCount.has(a)) coCount.set(a, new Map());
    const row = coCount.get(a)!;
    row.set(b, (row.get(b) ?? 0) + 1);
  };

  for (const action of layoutActionGraph(actions)) {
    const col = action.column ?? 1;
    const ids = action.ingredientIds.filter((id) => known.has(id));
    for (const id of ids) {
      firstCol.set(id, Math.min(firstCol.get(id) ?? col, col));
      lastCol.set(id, Math.max(lastCol.get(id) ?? col, col));
    }
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        bump(ids[i], ids[j]);
        bump(ids[j], ids[i]);
      }
    }
  }

  const remaining = new Set(ingredients.map((ing) => ing.id));
  const ordered: string[] = [];
  const placed = new Set<string>();

  // Primero: insertar cada grupo de acción como bloque.
  // Los nuevos van al final para no romper grupos tempranos ya contiguos.
  for (const action of layoutActionGraph(actions)) {
    const ids = action.ingredientIds.filter((id) => known.has(id));
    const neu = ids.filter((id) => !placed.has(id));
    if (neu.length === 0) continue;

    for (const id of neu) {
      ordered.push(id);
      placed.add(id);
      remaining.delete(id);
    }
  }

  while (remaining.size > 0) {
    const previous = ordered[ordered.length - 1] ?? null;
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const id of remaining) {
      const first = firstCol.get(id) ?? 999;
      const last = lastCol.get(id) ?? 0;
      const co = previous ? (coCount.get(previous)?.get(id) ?? 0) : 0;
      const score = co * 1000 - first * 10 + last;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    if (!best) break;
    ordered.push(best);
    remaining.delete(best);
  }

  return ordered.map((id) => byId.get(id)!).filter(Boolean);
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function canMergeActions(a: CfeAction, b: CfeAction): boolean {
  if (isMicroVerb(b.verb) && isCookVerb(a.verb)) return true;

  // Solo fusionar dos cocciones seguidas si son exactamente los mismos ingredientes
  // (ej. hornear 10 + hornear 10 vuelta y vuelta). No fusionar base + gratinado.
  if (
    isCookVerb(a.verb) &&
    isCookVerb(b.verb) &&
    sameIdSet(a.ingredientIds, b.ingredientIds)
  ) {
    const sameFamily =
      (/hornear|asar|gratinar/i.test(a.verb) &&
        /hornear|asar|gratinar/i.test(b.verb)) ||
      (/saltear|sofre[ií]r|rehogar/i.test(a.verb) &&
        /saltear|sofre[ií]r|rehogar/i.test(b.verb)) ||
      (/hervir|blanquear/i.test(a.verb) && /hervir|blanquear/i.test(b.verb));
    if (sameFamily) return true;
  }

  return false;
}

function mergeActions(a: CfeAction, b: CfeAction): CfeAction {
  let verb = a.verb.trim();
  if (isMicroVerb(b.verb)) {
    verb = /vuelta/i.test(a.verb) ? a.verb : `${a.verb} vuelta y vuelta`;
  } else if (/hornear|asar|gratinar/i.test(a.verb) && /hornear|asar|gratinar/i.test(b.verb)) {
    verb = /vuelta/i.test(b.verb) ? `${a.verb} vuelta y vuelta` : a.verb;
  }

  const duration = combineDuration(a.duration, b.duration);
  const deps = [
    ...new Set([...(a.dependsOn ?? []), ...(b.dependsOn ?? [])]),
  ].filter(Boolean);

  return {
    column: a.column,
    verb,
    ingredientIds: unionIds(a.ingredientIds, b.ingredientIds),
    duration,
    dependsOn: deps.length > 0 ? deps : undefined,
  };
}

/** Fusiona micro-pasos secuenciales (vuelta y vuelta, hornear+hornear). */
export function compressSequentialActions(actions: CfeAction[]): CfeAction[] {
  if (actions.length <= 1) return actions;

  const result = [...actions];
  let changed = true;
  let guard = 0;

  while (changed && guard < 30) {
    changed = false;
    guard += 1;
    for (let i = 0; i < result.length - 1; i++) {
      const current = result[i];
      const next = result[i + 1];
      if (!canMergeActions(current, next)) continue;
      result.splice(i, 2, mergeActions(current, next));
      changed = true;
      break;
    }
  }

  return result;
}

/** Un "mezclar todo" no puede ir antes de terminar de saltear/asar esas filas. */
function orderActionsForGraph(actions: CfeAction[]): CfeAction[] {
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

function inferDependencies(ordered: CfeAction[], index: number): number[] {
  const action = ordered[index];
  const explicit = (action.dependsOn ?? [])
    .map((n) => n - 1)
    .filter((j) => j >= 0 && j < index);

  const inferred: number[] = [];
  for (let j = 0; j < index; j++) {
    if (!idsOverlap(action.ingredientIds, ordered[j].ingredientIds)) continue;
    if (!isGraphVerb(ordered[j].verb) || !isGraphVerb(action.verb)) continue;

    const prev = ordered[j];
    const cur = action;

    if (isPrepVerb(prev.verb) && (isPrepVerb(cur.verb) || isCookVerb(cur.verb))) {
      inferred.push(j);
    } else if (isCookVerb(prev.verb) && isCookVerb(cur.verb)) {
      inferred.push(j);
    } else if (isAssembleVerb(prev.verb) && isCookVerb(cur.verb)) {
      inferred.push(j);
    } else if (isCookVerb(prev.verb) && isAssembleVerb(cur.verb)) {
      inferred.push(j);
    } else if (isMergeVerb(cur.verb)) {
      inferred.push(j);
    } else if (isAssembleVerb(prev.verb) && isAssembleVerb(cur.verb)) {
      inferred.push(j);
    } else if (isPrepVerb(prev.verb) && isAssembleVerb(cur.verb)) {
      inferred.push(j);
    }
  }

  return [...new Set([...inferred, ...explicit])];
}

/**
 * Columna = 1 + max(columnas de las que depende).
 * Misma columna solo si no hay dependencia (se pueden hacer en paralelo).
 */
export function layoutActionGraph(actions: CfeAction[]): CfeAction[] {
  if (actions.length === 0) return actions;

  const ordered = orderActionsForGraph(actions);
  const deps = ordered.map((_, i) => inferDependencies(ordered, i));

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

/** Solo notas de equipo/horno (sin tocar ingredientes) van arriba de la tabla. */
const PREP_ROW_ALLOWED =
  /\b(precalentar|preheat|calentar el horno|encender el horno|poner el horno|preparar el horno|horno a)\b/i;

const PREP_ROW_FORBIDDEN =
  /\b(mezclar|a[ñn]adir|agregar|incorporar|verter|volcar|hornear|saltear|fre[ií]r|cocinar|hervir|asar|cubrir|pincelar|untar|amasar|batir|picar|cortar|salar|secar|reposar|marinar|gratinar|dorar|sofre[ií]r|tostar|blanquear|ali[ñn]ar|montar|rellenar|disponer|colocar|servir)\b/i;

function isAllowedPrepRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (!PREP_ROW_ALLOWED.test(trimmed)) return false;
  // Si además manda a mezclar/hornear/etc., no es solo prep de horno.
  const withoutPreheat = trimmed.replace(PREP_ROW_ALLOWED, " ");
  if (PREP_ROW_FORBIDDEN.test(withoutPreheat)) return false;
  return true;
}

/**
 * Prep de ingredientes (cortar/mezclar/hornear…) va en la tabla.
 * prepRows = solo cosas como "Precalentar el horno…".
 */
export function refineCfeActions(input: {
  actions: CfeAction[];
  prepRows?: string[];
}): {
  actions: CfeAction[];
  prepRows: string[];
  prepCoveredIds: Set<string>;
} {
  let actions = sanitizeDependsOn(input.actions);
  actions = compressSequentialActions(actions);
  actions = layoutActionGraph(actions);

  const actionLabels = new Set(
    actions.map((action) => formatCfeActionLabel(action).toLowerCase()),
  );
  const prepRows = (input.prepRows ?? []).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (actionLabels.has(trimmed.toLowerCase())) return false;
    return isAllowedPrepRow(trimmed);
  });

  return {
    actions,
    prepRows,
    prepCoveredIds: new Set(),
  };
}

function normalizeId(value: string): string {
  return slugify(value).replace(/-/g, "_");
}

export function assessCfeQuality(cfe: CfeData): {
  ok: boolean;
  maxColumn: number;
  emptyRatio: number;
} {
  const laidOut = cfe.actions;
  const maxColumn = laidOut.reduce(
    (max, action) => Math.max(max, action.column ?? 1),
    0,
  );
  const rowCount = cfe.ingredients.length;
  if (rowCount === 0 || maxColumn === 0) {
    return { ok: false, maxColumn: 0, emptyRatio: 1 };
  }

  const idToRow = new Map(cfe.ingredients.map((ing, i) => [ing.id, i]));
  let filled = 0;
  const total = rowCount * maxColumn;
  const occupied = Array.from({ length: rowCount }, () =>
    Array.from({ length: maxColumn }, () => false),
  );

  for (const action of laidOut) {
    const col = (action.column ?? 1) - 1;
    for (const id of action.ingredientIds) {
      const row = idToRow.get(id);
      if (row == null || col < 0 || col >= maxColumn) continue;
      occupied[row][col] = true;
    }
  }
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < maxColumn; col++) {
      if (occupied[row][col]) filled += 1;
    }
  }

  // Sin límite de columnas ni ratio de vacíos: solo informativo.
  return {
    ok: true,
    maxColumn,
    emptyRatio: total > 0 ? 1 - filled / total : 1,
  };
}

function resolveActionIds(
  actions: CfeAction[],
  ingredients: CfeData["ingredients"],
  aiIngredients: CfeData["ingredients"],
): CfeAction[] {
  const canonicalByNorm = new Map(
    ingredients.map((ing) => [normalizeId(ing.id), ing.id]),
  );
  for (const ing of ingredients) {
    const fromLabel = normalizeId(ing.label);
    if (fromLabel) canonicalByNorm.set(fromLabel, ing.id);
    const nameOnly = normalizeId(ing.label.replace(/^[\d½¼¾./\s]+/, ""));
    if (nameOnly) canonicalByNorm.set(nameOnly, ing.id);
  }

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
      const direct =
        aiIdToCanonical.get(raw) ?? canonicalByNorm.get(normalizeId(raw));
      if (direct && !resolved.includes(direct)) resolved.push(direct);
    }
    return resolved;
  };

  return actions
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
    );
}

function isFullyCovered(
  ingredients: CfeData["ingredients"],
  actions: CfeAction[],
): boolean {
  const covered = new Set(actions.flatMap((a) => a.ingredientIds));
  return ingredients.every((ing) => covered.has(ing.id));
}

/**
 * Reescribe CFE con labels correctos, ordena filas y valida el árbol.
 * Si no es usable, devuelve null (la UI no muestra la pestaña).
 */
export function normalizeAndValidateCfe(
  structured: Pick<StructuredRecipe, "ingredients" | "cfe">,
): CfeData | null {
  const ingredients = buildCfeIngredients(structured.ingredients);
  if (ingredients.length === 0) return null;
  if (ingredients.some((ing) => !hasLetter(ing.label))) return null;

  const resolvedActions = resolveActionIds(
    structured.cfe?.actions ?? [],
    ingredients,
    structured.cfe?.ingredients ?? [],
  );
  if (resolvedActions.length === 0) return null;

  const refined = refineCfeActions({
    actions: resolvedActions,
    prepRows: structured.cfe?.prepRows ?? [],
  });

  if (!isFullyCovered(ingredients, refined.actions)) {
    return null;
  }

  const finalAction = structured.cfe?.finalAction ?? {
    verb: "Servir",
    tempC: null,
    tempF: null,
  };
  if (!finalAction.verb?.trim()) return null;

  const orderedIngredients = reorderIngredientsForActions(
    ingredients,
    refined.actions,
  );

  const cfe: CfeData = {
    prepRows: refined.prepRows.filter((line) => hasLetter(line)),
    ingredients: orderedIngredients,
    actions: refined.actions,
    finalAction: {
      verb: finalAction.verb.trim(),
      tempC: finalAction.tempC ?? null,
      tempF: finalAction.tempF ?? null,
      duration: "duration" in finalAction ? finalAction.duration : undefined,
      notes: "notes" in finalAction ? finalAction.notes : undefined,
    },
  };

  if (!isUsableCfe(cfe)) return null;
  return cfe;
}

export function isUsableCfe(
  cfe: CfeData | null | undefined,
): cfe is CfeData {
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
  return cfe.ingredients.every((ing) => covered.has(ing.id));
}

/** Ensambla CFE con ingredientes fijos + actions del modelo. */
export function assembleCfe(input: {
  ingredients: CfeData["ingredients"];
  actions: CfeData["actions"];
  finalAction?: CfeData["finalAction"];
  prepRows?: string[];
}): CfeData | null {
  const idSet = new Set(input.ingredients.map((i) => i.id));
  const resolved = (input.actions ?? [])
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
    );

  const refined = refineCfeActions({
    actions: resolved,
    prepRows: input.prepRows ?? [],
  });

  const cfe: CfeData = {
    prepRows: refined.prepRows.filter((line) => hasLetter(line)),
    ingredients: reorderIngredientsForActions(
      input.ingredients,
      refined.actions,
    ),
    actions: refined.actions,
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

/** Re-refina un CFE ya guardado (sin llamar a la IA). */
export function refineStoredCfe(cfe: CfeData): CfeData | null {
  const refined = refineCfeActions({
    actions: cfe.actions,
    prepRows: cfe.prepRows,
  });

  const next: CfeData = {
    ...cfe,
    prepRows: refined.prepRows.filter((line) => hasLetter(line)),
    ingredients: reorderIngredientsForActions(
      cfe.ingredients,
      refined.actions,
    ),
    actions: refined.actions,
  };

  return isUsableCfe(next) ? next : null;
}
