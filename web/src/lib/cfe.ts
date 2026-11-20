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
  /saltear|sofre[ií]r|hervir|hornear|asar|cocinar|fre[ií]r|tostar|dorar|rehogar|pochar|blanquear|reducir|gratinar|sellad/i;
const COAT_VERB =
  /\b(mezclar|pincelar|untar|espolvorear|frotar|ali[ñn]ar)\b/i;
const PREP_VERB =
  /\b(cortar|picar|salar|secar|reposar|lavar|pelar|desvenar|escurrir|partir|rebanar|laminar|filetear|trocear|desmenuzar|marinar|desalgar|escaldar|enjuagar|procesar|batir|amasar)\b/i;
const MICRO_VERB =
  /\b(dar la vuelta|dar vuelta|voltear|girar|retornar)\b/i;
const ASSEMBLE_VERB = /\b(cubrir|armar|rellenar|colocar|montar|disponer|espolvorear)\b/i;

function isMergeVerb(verb: string): boolean {
  return MERGE_VERB.test(verb);
}

function isCookVerb(verb: string): boolean {
  return COOK_VERB.test(verb);
}

function isCoatVerb(verb: string): boolean {
  return COAT_VERB.test(verb) && !isCookVerb(verb);
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
    isPrepVerb(verb) ||
    isCoatVerb(verb)
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

function actionSpanPenalty(
  order: string[],
  actions: CfeAction[],
  known: Set<string>,
): number {
  const pos = new Map(order.map((id, index) => [id, index]));
  let penalty = 0;
  for (const action of actions) {
    const rows = [
      ...new Set(
        action.ingredientIds
          .filter((id) => known.has(id))
          .map((id) => pos.get(id))
          .filter((row): row is number => row !== undefined),
      ),
    ].sort((a, b) => a - b);
    if (rows.length < 2) continue;
    const span = rows[rows.length - 1] - rows[0] + 1;
    const holes = span - rows.length;
    // Streams chicos pesan más: un agujero en "batir crema+azúcar" es peor
    // que uno en el join final de toda la receta.
    const size = rows.length;
    const weight = size <= 3 ? 5 : size <= 6 ? 2 : 1;
    penalty += (holes * holes * 12 + holes * 4 + span) * weight;
  }
  return penalty;
}

function moveId(order: string[], from: number, to: number): string[] {
  if (from === to) return order;
  const next = [...order];
  const [id] = next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
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
  const laidOut = layoutActionGraph(actions);

  const remaining = new Set(ingredients.map((ing) => ing.id));
  const ordered: string[] = [];
  const placed = new Set<string>();

  // Insertar cada grupo pegado al cluster ya colocado de esa acción
  // (evita crema|azúcar|café|mascarpone cuando mascarpone va con crema).
  for (const action of laidOut) {
    const ids = action.ingredientIds.filter((id) => known.has(id));
    const neu = ids.filter((id) => !placed.has(id));
    if (neu.length === 0) continue;

    const placedInAction = ids
      .map((id) => ordered.indexOf(id))
      .filter((index) => index >= 0);
    const insertAt =
      placedInAction.length > 0
        ? Math.max(...placedInAction) + 1
        : ordered.length;

    ordered.splice(insertAt, 0, ...neu);
    for (const id of neu) {
      placed.add(id);
      remaining.delete(id);
    }
  }

  for (const id of remaining) ordered.push(id);

  // Búsqueda local: mover filas para minimizar huecos en rowspans.
  let best = ordered;
  let bestScore = actionSpanPenalty(best, laidOut, known);
  for (let pass = 0; pass < 3; pass += 1) {
    let improved = false;
    for (let from = 0; from < best.length; from += 1) {
      let localBest = best;
      let localScore = bestScore;
      for (let to = 0; to < best.length; to += 1) {
        if (to === from) continue;
        const candidate = moveId(best, from, to);
        const score = actionSpanPenalty(candidate, laidOut, known);
        if (score < localScore) {
          localScore = score;
          localBest = candidate;
        }
      }
      if (localScore < bestScore) {
        best = localBest;
        bestScore = localScore;
        improved = true;
      }
    }
    if (!improved) break;
  }

  return best.map((id) => byId.get(id)!).filter(Boolean);
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Merge “grande” = junta streams; no confundir con mezclar aceite antes de asar. */
function isLargeJoin(
  action: CfeAction,
  cook: CfeAction,
  totalIngredientIds: number,
): boolean {
  if (!isMergeVerb(action.verb) && !isAssembleVerb(action.verb)) return false;
  if (sameIdSet(action.ingredientIds, cook.ingredientIds)) return false;
  if (action.ingredientIds.length <= cook.ingredientIds.length) return false;
  const coversMost =
    totalIngredientIds > 0 &&
    action.ingredientIds.length >=
      Math.max(3, Math.ceil(totalIngredientIds * 0.5));
  const expandsCook =
    action.ingredientIds.length >= cook.ingredientIds.length + 2;
  return coversMost || expandsCook;
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

/**
 * 1) Coat/prep del mismo grupo ANTES de cocinarlo (mezclar aceite → asar).
 * 2) Join grande DESPUÉS de las cocciones que aporta (no mover el coat chico).
 */
function orderActionsForGraph(actions: CfeAction[]): CfeAction[] {
  const result = [...actions];
  const allIds = new Set(actions.flatMap((a) => a.ingredientIds));
  const total = allIds.size;
  let changed = true;
  let guard = 0;

  while (changed && guard < 50) {
    changed = false;
    guard += 1;

    // Coat/prep ANTES de cook solo si es EXACTAMENTE el mismo grupo
    // (mezclar brócoli+aceite → asar). No mover joins más amplios
    // (mezclar pasta+tomates NO va antes del salteado de tomates).
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const earlier = result[i];
        const later = result[j];
        if (!isCookVerb(earlier.verb)) continue;
        if (!sameIdSet(earlier.ingredientIds, later.ingredientIds)) continue;
        const laterIsCoatOrPrep =
          isCoatVerb(later.verb) ||
          isPrepVerb(later.verb) ||
          (isMergeVerb(later.verb) && !isLargeJoin(later, earlier, total));
        if (!laterIsCoatOrPrep) continue;
        const [moved] = result.splice(j, 1);
        result.splice(i, 0, moved);
        changed = true;
        break;
      }
      if (changed) break;
    }
    if (changed) continue;

    // Join grande después del cook cuyas filas cubre.
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const earlier = result[i];
        const later = result[j];
        if (!isCookVerb(later.verb)) continue;
        if (!isLargeJoin(earlier, later, total)) continue;
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
  const totalIds = new Set(ordered.flatMap((a) => a.ingredientIds)).size;

  const inferred: number[] = [];
  for (let j = 0; j < index; j++) {
    if (!idsOverlap(action.ingredientIds, ordered[j].ingredientIds)) continue;
    if (!isGraphVerb(ordered[j].verb) || !isGraphVerb(action.verb)) continue;

    const prev = ordered[j];
    const cur = action;

    if (
      (isPrepVerb(prev.verb) || isCoatVerb(prev.verb)) &&
      (isPrepVerb(cur.verb) || isCoatVerb(cur.verb) || isCookVerb(cur.verb))
    ) {
      inferred.push(j);
    } else if (isCookVerb(prev.verb) && isCookVerb(cur.verb)) {
      inferred.push(j);
    } else if (isAssembleVerb(prev.verb) && isCookVerb(cur.verb)) {
      inferred.push(j);
    } else if (isCookVerb(prev.verb) && isAssembleVerb(cur.verb)) {
      inferred.push(j);
    } else if (isMergeVerb(cur.verb) || isAssembleVerb(cur.verb)) {
      inferred.push(j);
    } else if (isAssembleVerb(prev.verb) && isAssembleVerb(cur.verb)) {
      inferred.push(j);
    } else if (
      (isPrepVerb(prev.verb) || isCoatVerb(prev.verb)) &&
      isAssembleVerb(cur.verb)
    ) {
      inferred.push(j);
    } else if (
      // Mezclar quinoa+brócoli → luego Hornear esa cazuela
      isCookVerb(cur.verb) &&
      (isMergeVerb(prev.verb) || isAssembleVerb(prev.verb)) &&
      prev.ingredientIds.every((id) => cur.ingredientIds.includes(id)) &&
      cur.ingredientIds.length >= prev.ingredientIds.length
    ) {
      inferred.push(j);
    }
  }

  // Cocción amplia (cazuela final): espera merges/cocciones previas que aporta
  if (
    isCookVerb(action.verb) &&
    action.ingredientIds.length >= Math.max(4, Math.ceil(totalIds * 0.5))
  ) {
    for (let j = 0; j < index; j++) {
      if (!idsOverlap(action.ingredientIds, ordered[j].ingredientIds)) continue;
      if (
        isMergeVerb(ordered[j].verb) ||
        isAssembleVerb(ordered[j].verb) ||
        isCookVerb(ordered[j].verb)
      ) {
        inferred.push(j);
      }
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

/** Acorta verbs prosaicos que la IA a veces genera. */
function shortenVerboseVerb(verb: string): string {
  const trimmed = verb.trim();
  if (trimmed.split(/\s+/).length < 6) return trimmed;

  const known =
    trimmed.match(
      /\b(precalentar|hornear|saltear|sofre[ií]r|rehogar|hervir|asar|fre[ií]r|tostar|dorar|gratinar|mezclar|incorporar|triturar|procesar|batir|amasar|marinar|empapar|remojar|escurrir|cortar|picar|pincelar|cubrir|armar|rellenar|emplatar|espolvorear|ali[ñn]ar|reducir|cocinar|calentar|servir)\b/i,
    )?.[1] ?? null;
  if (known) {
    const base = known.charAt(0).toUpperCase() + known.slice(1).toLowerCase();
    if (/vuelta/i.test(trimmed)) return `${base} vuelta y vuelta`;
    return base;
  }
  return trimmed.split(/\s+/).slice(0, 3).join(" ");
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
  let actions = sanitizeDependsOn(
    input.actions.map((action) => ({
      ...action,
      verb: shortenVerboseVerb(action.verb),
    })),
  );
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

export type CfeIssue = {
  code:
    | "empty_actions"
    | "uncovered"
    | "orphan_id"
    | "bad_deps"
    | "coat_after_cook"
    | "early_large_join"
    | "non_contiguous"
    | "collapsed_sequence"
    | "thin_final_join"
    | "verbose_verb"
    | "bad_prep";
  detail: string;
};

/**
 * Diagnóstico semántico de CFE (post-refine).
 * Sirve para decidir si hace falta un segundo pase de IA.
 */
export function diagnoseCfeIssues(cfe: CfeData): CfeIssue[] {
  const issues: CfeIssue[] = [];
  const refined = refineStoredCfe(cfe) ?? cfe;
  const actions = layoutActionGraph(refined.actions ?? []);
  const ingredients = reorderIngredientsForActions(
    refined.ingredients ?? [],
    actions,
  );
  const idSet = new Set(ingredients.map((i) => i.id));
  const total = idSet.size;

  if (actions.length === 0) {
    issues.push({ code: "empty_actions", detail: "sin actions" });
    return issues;
  }

  const covered = new Set(actions.flatMap((a) => a.ingredientIds));
  for (const ing of ingredients) {
    if (!covered.has(ing.id)) {
      issues.push({ code: "uncovered", detail: ing.label });
    }
  }

  for (const action of actions) {
    for (const id of action.ingredientIds) {
      if (!idSet.has(id)) {
        issues.push({ code: "orphan_id", detail: `${action.verb}: ${id}` });
      }
    }
    if (action.verb.trim().split(/\s+/).length >= 8) {
      issues.push({ code: "verbose_verb", detail: action.verb });
    }
  }

  actions.forEach((action, index) => {
    for (const dep of action.dependsOn ?? []) {
      if (!Number.isInteger(dep) || dep < 1 || dep > index) {
        issues.push({
          code: "bad_deps",
          detail: `action ${index + 1} dependsOn=${dep}`,
        });
      }
    }
  });

  for (let i = 0; i < actions.length; i++) {
    for (let j = i + 1; j < actions.length; j++) {
      const earlier = actions[i];
      const later = actions[j];
      if (!isCookVerb(earlier.verb)) continue;
      if (!(isCoatVerb(later.verb) || isPrepVerb(later.verb))) continue;
      if (!sameIdSet(earlier.ingredientIds, later.ingredientIds)) continue;
      issues.push({
        code: "coat_after_cook",
        detail: `${earlier.verb} antes de ${later.verb}`,
      });
    }
  }

  actions.forEach((action, index) => {
    // "Combinar y hervir" es cocción, no un join prematuro
    if (isCookVerb(action.verb)) return;
    if (!isMergeVerb(action.verb) && !isAssembleVerb(action.verb)) return;
    if (/espolvorear|decorar|ali[ñn]ar$/i.test(action.verb)) return;
    if (action.ingredientIds.length < Math.max(3, Math.ceil(total * 0.55))) {
      return;
    }
    const laterCook = actions.slice(index + 1).some((other) => {
      if (!isCookVerb(other.verb)) return false;
      // Hornear/asar la cazuela armada (join ⊆ cook o casi) es válido
      const outside = other.ingredientIds.filter(
        (id) => !action.ingredientIds.includes(id),
      );
      if (outside.length <= 1) return false;
      if (outside.length < Math.ceil(other.ingredientIds.length * 0.4)) {
        return false;
      }
      // Mala señal: otra cocción mayormente fuera del join (otro stream)
      return true;
    });
    if (laterCook) {
      issues.push({
        code: "early_large_join",
        detail: `${action.verb} (#${index + 1}) antes de otra cocción`,
      });
    }
  });

  const idToRow = new Map(ingredients.map((ing, i) => [ing.id, i]));
  for (const action of actions) {
    const rows = [
      ...new Set(
        action.ingredientIds
          .map((id) => idToRow.get(id))
          .filter((row): row is number => row !== undefined),
      ),
    ].sort((a, b) => a - b);
    if (rows.length < 2) continue;
    const span = rows[rows.length - 1] - rows[0] + 1;
    // Solo flaggear streams chicos/medianos: el join final suele abarcar todo
    if (span !== rows.length && rows.length <= Math.max(6, Math.ceil(total * 0.6))) {
      issues.push({
        code: "non_contiguous",
        detail: `${action.verb} rows=[${rows.join(",")}]`,
      });
    }
  }

  // 4 ids juntos suele ser un sofrito legítimo (cebolla+puerro+morrón+zanahoria).
  // Flaggear desde 5+: típico ajo+verdura+frutos secos u otras secuencias aplastadas.
  for (const action of actions) {
    if (!isCookVerb(action.verb)) continue;
    if (
      /saltear|sofre[ií]r|rehogar/i.test(action.verb) &&
      action.ingredientIds.length >= 5
    ) {
      issues.push({
        code: "collapsed_sequence",
        detail: `${action.verb} con ${action.ingredientIds.length} ids (¿secuencia aplastada?)`,
      });
    }
  }

  // Solo flaggear si NINGUNA acción cubre una porción seria del plato.
  // Evita falsos positivos (hummus/nuggets donde "Procesar" ya junta todo
  // y el último "Mezclar" chico es un coat intermedio).
  const coverageThreshold = Math.max(3, Math.ceil(total * 0.5));
  const widest = actions.reduce(
    (max, action) => Math.max(max, action.ingredientIds.length),
    0,
  );
  const lastJoin = [...actions]
    .reverse()
    .find(
      (action) =>
        (isMergeVerb(action.verb) ||
          isAssembleVerb(action.verb) ||
          /combinar/i.test(action.verb)) &&
        !/espolvorear|decorar/i.test(action.verb),
    );
  if (
    lastJoin &&
    total >= 5 &&
    widest < coverageThreshold &&
    lastJoin.ingredientIds.length <= Math.max(2, Math.floor(total * 0.35))
  ) {
    issues.push({
      code: "thin_final_join",
      detail: `${lastJoin.verb} solo cubre ${lastJoin.ingredientIds.length}/${total} (max cobertura ${widest})`,
    });
  }

  for (const line of refined.prepRows ?? []) {
    if (
      /mezclar|agregar|a[ñn]adir|hornear|cortar|saltear|picar|incorporar|verter/i.test(
        line,
      )
    ) {
      issues.push({ code: "bad_prep", detail: line });
    }
  }

  return issues;
}

/** Issues que justifican reintentar con la IA. */
export function cfeNeedsAiRepair(issues: CfeIssue[]): boolean {
  // collapsed_sequence es solo warning: muchas recetas rehogan A+B+C+D en un
  // solo paso legítimo (ej. sopa baba). No forzar rebuild por eso.
  const serious = new Set<CfeIssue["code"]>([
    "empty_actions",
    "uncovered",
    "orphan_id",
    "coat_after_cook",
    "early_large_join",
    "thin_final_join",
    "bad_prep",
  ]);
  return issues.some((issue) => serious.has(issue.code));
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

/**
 * Si la IA olvidó un id (típico: cebollín/perejil de decorar), agrega una
 * action final para no tirar todo el CFE por un garnish.
 */
export function ensureIngredientCoverage(
  ingredients: CfeData["ingredients"],
  actions: CfeAction[],
): CfeAction[] {
  const covered = new Set(actions.flatMap((action) => action.ingredientIds));
  const missing = ingredients
    .map((ing) => ing.id)
    .filter((id) => !covered.has(id));
  if (missing.length === 0) return actions;

  return [
    ...actions,
    {
      column: (actions[actions.length - 1]?.column ?? 0) + 1,
      verb: missing.length <= 2 ? "Decorar" : "Incorporar",
      ingredientIds: missing,
      dependsOn: actions.length > 0 ? [actions.length] : undefined,
    },
  ];
}

/**
 * Si ningún paso junta al menos ~50% de los ingredientes, agrega un Incorporar
 * con todos los ids ya usados (une streams que la IA dejó colgados).
 */
export function ensureFinalJoinCoverage(
  ingredients: CfeData["ingredients"],
  actions: CfeAction[],
): CfeAction[] {
  if (actions.length === 0) return actions;
  const total = ingredients.length;
  const threshold = Math.max(3, Math.ceil(total * 0.5));
  const widest = actions.reduce(
    (max, action) => Math.max(max, action.ingredientIds.length),
    0,
  );
  if (widest >= threshold) return actions;

  const allUsed = [...new Set(actions.flatMap((action) => action.ingredientIds))];
  if (allUsed.length < threshold) return actions;

  return [
    ...actions,
    {
      column: (actions[actions.length - 1]?.column ?? 0) + 1,
      verb: "Incorporar",
      ingredientIds: allUsed,
      dependsOn: [actions.length],
    },
  ];
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

  const covered = ensureFinalJoinCoverage(
    input.ingredients,
    ensureIngredientCoverage(input.ingredients, resolved),
  );

  const refined = refineCfeActions({
    actions: covered,
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
export function refineStoredCfe(cfe: CfeData | null | undefined): CfeData | null {
  if (!cfe) return null;
  const refined = refineCfeActions({
    actions: cfe.actions ?? [],
    prepRows: cfe.prepRows ?? [],
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
