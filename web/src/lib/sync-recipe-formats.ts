import {
  assembleCfe,
  formatCfeActionLabel,
  isUsableCfe,
  refineStoredCfe,
} from "./cfe";
import type { CfeData, Ingredient } from "./recipe-schema";

/** Serializa CFE a texto editable. */
export function serializeCfeForEdit(cfe: CfeData | null): {
  prepText: string;
  ingredientsText: string;
  actionsText: string;
  finalText: string;
} {
  if (!cfe) {
    return { prepText: "", ingredientsText: "", actionsText: "", finalText: "Servir" };
  }

  const prepText = cfe.prepRows.join("\n");
  const ingredientsText = cfe.ingredients
    .map((ing) => `${ing.id} | ${ing.label}`)
    .join("\n");
  const actionsText = cfe.actions
    .map((action, index) => {
      const ids = action.ingredientIds.join(",");
      const duration = action.duration?.trim() ? ` | ${action.duration.trim()}` : "";
      const depends =
        action.dependsOn && action.dependsOn.length > 0
          ? ` | depends:${action.dependsOn.join(",")}`
          : "";
      return `${index + 1}. ${action.verb.trim()} | ${ids}${duration}${depends}`;
    })
    .join("\n");

  const finalParts = [cfe.finalAction.verb.trim() || "Servir"];
  if (cfe.finalAction.duration) finalParts.push(cfe.finalAction.duration);
  if (cfe.finalAction.notes) finalParts.push(cfe.finalAction.notes);
  if (cfe.finalAction.tempC != null) finalParts.push(`${cfe.finalAction.tempC}°C`);

  return {
    prepText,
    ingredientsText,
    actionsText,
    finalText: finalParts.join(" | "),
  };
}

function parseIngredientLine(line: string, index: number): { id: string; label: string } {
  const trimmed = line.trim();
  const pipe = trimmed.indexOf("|");
  if (pipe >= 0) {
    const id = trimmed.slice(0, pipe).trim().replace(/\s+/g, "_");
    const label = trimmed.slice(pipe + 1).trim();
    return {
      id: id || `ing_${index + 1}`,
      label: label || id || `ingrediente ${index + 1}`,
    };
  }
  const id = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return { id: id || `ing_${index + 1}`, label: trimmed };
}

function parseActionLine(
  line: string,
  knownIds: Set<string>,
): CfeData["actions"][number] | null {
  // "1. Verb | id1,id2 | 10 min | depends:1,2"
  let body = line.trim();
  body = body.replace(/^\d+\.\s*/, "");
  if (!body) return null;

  const parts = body.split("|").map((p) => p.trim());
  if (parts.length < 2) return null;

  const verb = parts[0];
  if (!verb) return null;

  const ingredientIds = parts[1]
    .split(/[,;]+/)
    .map((id) => id.trim())
    .filter((id) => id && knownIds.has(id));

  if (ingredientIds.length === 0) return null;

  let duration: string | undefined;
  let dependsOn: number[] | undefined;

  for (let i = 2; i < parts.length; i++) {
    const part = parts[i];
    const dependsMatch = part.match(/^depends\s*:\s*(.+)$/i);
    if (dependsMatch) {
      dependsOn = dependsMatch[1]
        .split(/[,;]+/)
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      continue;
    }
    if (part) duration = part;
  }

  return {
    column: 1,
    verb,
    ingredientIds,
    duration,
    dependsOn,
  };
}

/** Parsea el texto editable de CFE. */
export function parseCfeFromEdit(input: {
  prepText: string;
  ingredientsText: string;
  actionsText: string;
  finalText: string;
}): CfeData | null {
  const ingredients = input.ingredientsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseIngredientLine);

  if (ingredients.length === 0) return null;

  const knownIds = new Set(ingredients.map((ing) => ing.id));
  const actions = input.actionsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseActionLine(line, knownIds))
    .filter((action): action is NonNullable<typeof action> => action !== null);

  const finalParts = input.finalText
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  const verb = finalParts[0] || "Servir";
  let duration: string | undefined;
  let notes: string | undefined;
  let tempC: number | null = null;

  for (let i = 1; i < finalParts.length; i++) {
    const part = finalParts[i];
    const tempMatch = part.match(/^(\d+)\s*°?\s*C$/i);
    if (tempMatch) {
      tempC = Number(tempMatch[1]);
      continue;
    }
    if (/\d+\s*min/i.test(part) && !duration) {
      duration = part;
      continue;
    }
    notes = notes ? `${notes} ${part}` : part;
  }

  const assembled = assembleCfe({
    ingredients,
    actions,
    prepRows: input.prepText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    finalAction: {
      verb,
      tempC,
      tempF: null,
      duration,
      notes,
    },
  });

  if (assembled && isUsableCfe(assembled)) return assembled;
  return refineStoredCfe({
    prepRows: input.prepText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    ingredients,
    actions,
    finalAction: {
      verb,
      tempC,
      tempF: null,
      duration,
      notes,
    },
  });
}

/** CFE → ingredientes + pasos del formato clásico. */
export function classicFromCfe(cfe: CfeData): {
  ingredients: Ingredient[];
  steps: string[];
} {
  const labelById = new Map(cfe.ingredients.map((ing) => [ing.id, ing.label]));

  const ingredients: Ingredient[] = cfe.ingredients.map((ing) => ({
    name: ing.label,
    metricEstimated: false,
  }));

  const steps: string[] = [];
  for (const line of cfe.prepRows) {
    if (line.trim()) steps.push(line.trim());
  }

  for (const action of cfe.actions) {
    const labels = action.ingredientIds
      .map((id) => labelById.get(id) ?? id)
      .join(", ");
    const head = formatCfeActionLabel(action);
    steps.push(labels ? `${head}: ${labels}` : head);
  }

  const final = cfe.finalAction;
  if (final.verb && !/^servir$/i.test(final.verb.trim())) {
    const finalLabel = formatCfeActionLabel({
      verb: final.verb,
      duration: final.duration,
    });
    const extra = [final.notes, final.tempC != null ? `${final.tempC}°C` : null]
      .filter(Boolean)
      .join(" · ");
    steps.push(extra ? `${finalLabel} · ${extra}` : finalLabel);
  }

  return { ingredients, steps };
}

export function classicSignature(input: {
  ingredients: Ingredient[];
  steps: string[];
}): string {
  return JSON.stringify({
    ingredients: input.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
      prep: i.prep ?? null,
    })),
    steps: input.steps,
  });
}
