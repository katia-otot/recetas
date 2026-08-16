import { z } from "zod";

function asOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (typeof item === "number") return String(item);
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const candidate =
          record.text ??
          record.label ??
          record.name ??
          record.verb ??
          record.step;
        return typeof candidate === "string" ? candidate.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
}

export const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.unknown().optional().transform(asOptionalString),
  unit: z.unknown().optional().transform(asOptionalString),
  prep: z.unknown().optional().transform(asOptionalString),
  /** Equivalente en gramos cuando aplica (sólidos / densos). */
  grams: z.unknown().optional().transform(asOptionalString),
  /** Equivalente en ml cuando aplica (líquidos). */
  ml: z.unknown().optional().transform(asOptionalString),
  /** true si grams/ml son una estimación, no una conversión exacta del texto. */
  metricEstimated: z
    .union([z.boolean(), z.null(), z.undefined()])
    .optional()
    .transform((value) => (typeof value === "boolean" ? value : undefined)),
});

export const CfeActionSchema = z.object({
  column: z.preprocess((value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }
    // DeepSeek a veces manda "mix"/"cook": el grafo de dependencias
    // recalcula la columna real.
    return 1;
  }, z.number().int().positive()),
  verb: z.string(),
  ingredientIds: z.array(z.string()).catch([]),
  /** Tiempo si consta en la receta: "1 min", "5-7 min", "20 min". */
  duration: z.unknown().optional().transform(asOptionalString),
  /**
   * Acciones previas (índice 1-based) que deben terminar antes.
   * Sirve cuando no hay overlap de ingredientes (misma sartén, "después…").
   */
  dependsOn: z
    .unknown()
    .optional()
    .transform((value) => {
      if (!Array.isArray(value)) return [];
      return value
        .map((item) => Number(item))
        .filter((n) => Number.isInteger(n) && n > 0);
    }),
});

export const CfeSchema = z.object({
  prepRows: z.unknown().optional().transform((value) => asStringList(value ?? [])),
  ingredients: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
      }),
    )
    .optional()
    .transform((value) => value ?? []),
  actions: z
    .array(CfeActionSchema)
    .optional()
    .transform((value) =>
      (value ?? []).filter(
        (action) =>
          action.verb.trim().length > 0 && action.ingredientIds.length > 0,
      ),
    ),
  finalAction: z
    .preprocess((value) => {
      if (typeof value === "string") {
        const verb = value.trim() || "Servir";
        return { verb, tempC: null, tempF: null, duration: undefined, notes: undefined };
      }
      return value;
    }, z.object({
      verb: z.string().catch("Servir"),
      tempC: z.number().nullable().optional(),
      tempF: z.number().nullable().optional(),
      duration: z.unknown().optional().transform(asOptionalString),
      notes: z.unknown().optional().transform(asOptionalString),
    }))
    .optional()
    .transform(
      (value) =>
        value ?? {
          verb: "Servir",
          tempC: null,
          tempF: null,
          duration: undefined,
          notes: undefined,
        },
    ),
});

export const RecipeVersionSchema = z.object({
  label: z.string(),
  /** Solo los cambios clave respecto a la receta principal. */
  changes: z.unknown().optional().transform((value) => asStringList(value ?? [])),
});

export const StructuredRecipeSchema = z.object({
  title: z
    .unknown()
    .optional()
    .transform((value) => (typeof value === "string" ? value : "")),
  servings: z.number().nullable().optional(),
  ingredients: z
    .array(IngredientSchema)
    .optional()
    .transform((value) => value ?? []),
  steps: z.unknown().optional().transform((value) => asStringList(value ?? [])),
  personalNotes: z
    .unknown()
    .optional()
    .transform((value) => asStringList(value ?? [])),
  tags: z.unknown().optional().transform((value) => asStringList(value ?? [])),
  cuisines: z
    .unknown()
    .optional()
    .transform((value) => asStringList(value ?? [])),
  cfe: CfeSchema.optional().transform(
    (value) =>
      value ?? {
        prepRows: [],
        ingredients: [],
        actions: [],
        finalAction: {
          verb: "Servir",
          tempC: null,
          tempF: null,
          duration: undefined,
          notes: undefined,
        },
      },
  ),
  versions: z.array(RecipeVersionSchema).optional(),
});

export type StructuredRecipe = z.infer<typeof StructuredRecipeSchema>;
export type CfeData = z.infer<typeof CfeSchema>;
export type RecipeVersion = z.infer<typeof RecipeVersionSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;
export type UnitMode = "original" | "metric";

export type RecipeVersionStored = {
  label: string;
  changes: string[];
};

export function formatIngredient(
  item: Ingredient,
  mode: UnitMode = "original",
): string {
  const prepSuffix = item.prep ? ` (${item.prep})` : "";

  if (mode === "metric") {
    if (item.grams) {
      return `${item.grams} g ${item.name}${prepSuffix}`.trim();
    }
    if (item.ml) {
      return `${item.ml} ml ${item.name}${prepSuffix}`.trim();
    }
  }

  const parts = [item.quantity, item.unit, item.name].filter(Boolean);
  const base = parts.join(" ").trim() || item.name;
  return `${base}${prepSuffix}`;
}

export function ingredientHasMetric(item: Ingredient): boolean {
  return Boolean(item.grams || item.ml);
}

const LIQUID_NAME =
  /agua|leche|caldo|jugo|zumo|aceite|vinagre|salsa de soja|vino|crema|cocoa l[ií]quida|fond/i;

function parseQuantity(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.trim().replace(",", ".").replace("½", "0.5").replace("¼", "0.25").replace("¾", "0.75");
  const mixed = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  }
  const frac = normalized.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Completa grams/ml cuando la cantidad original se puede convertir. */
export function enrichIngredientMetrics(item: Ingredient): Ingredient {
  if (item.grams || item.ml) return item;
  const qty = parseQuantity(item.quantity);
  if (qty == null || qty <= 0) return item;
  const unit = (item.unit ?? "").toLowerCase().trim();
  const name = item.name.toLowerCase();

  if (/^(g|gr|grs|gramo|gramos)$/.test(unit)) {
    return { ...item, grams: String(Math.round(qty)) };
  }
  if (/^(kg|kilo|kilos)$/.test(unit)) {
    return { ...item, grams: String(Math.round(qty * 1000)) };
  }
  if (/^(ml|mililitro|mililitros)$/.test(unit)) {
    return { ...item, ml: String(Math.round(qty)) };
  }
  if (/^(l|litro|litros)$/.test(unit)) {
    return { ...item, ml: String(Math.round(qty * 1000)) };
  }
  if (/cucharadita|cdita|cdta|tsp/.test(unit)) {
    return { ...item, ml: String(Math.round(qty * 5)), metricEstimated: true };
  }
  if (/cucharada|cda|tbsp/.test(unit)) {
    return { ...item, ml: String(Math.round(qty * 15)), metricEstimated: true };
  }
  if (/taza|cup/.test(unit)) {
    if (LIQUID_NAME.test(name) || /aceite|agua|leche|caldo|jugo/.test(name)) {
      return { ...item, ml: String(Math.round(qty * 240)), metricEstimated: true };
    }
    return { ...item, grams: String(Math.round(qty * 120)), metricEstimated: true };
  }
  if (/onza|oz/.test(unit)) {
    return { ...item, grams: String(Math.round(qty * 28)), metricEstimated: true };
  }
  if (/libra|lb|pound/.test(unit)) {
    return { ...item, grams: String(Math.round(qty * 454)), metricEstimated: true };
  }
  return item;
}

export function parseStoredIngredients(raw: unknown): Ingredient[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (typeof item === "string") {
        return { name: item };
      }
      if (item && typeof item === "object") {
        const parsed = IngredientSchema.safeParse(item);
        return parsed.success ? parsed.data : null;
      }
      return null;
    })
    .filter((item): item is Ingredient => item !== null)
    .map(enrichIngredientMetrics);
}

export function parseStoredVersions(raw: unknown): RecipeVersionStored[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const version = item as Record<string, unknown>;
      const label =
        typeof version.label === "string" ? version.label : "Versión";

      // Formato nuevo
      let changes = asStringList(version.changes);

      // Compatibilidad con formato viejo (receta completa duplicada)
      if (changes.length === 0) {
        const notes = asStringList(version.personalNotes);
        const steps = asStringList(version.steps);
        changes = [
          ...notes,
          ...steps.slice(0, 3).map((step) => `Cambio en preparación: ${step}`),
        ];
      }

      if (changes.length === 0) return null;

      return { label, changes };
    })
    .filter((item): item is RecipeVersionStored => item !== null);
}

export function ingredientSearchTerms(ingredients: Ingredient[]): string[] {
  const names = ingredients.map((i) => i.name.toLowerCase().trim()).filter(Boolean);
  return [...new Set(names)];
}

export function collectSearchTerms(structured: StructuredRecipe): string[] {
  return ingredientSearchTerms(structured.ingredients);
}

export function serializeVersions(versions: RecipeVersion[]): RecipeVersionStored[] {
  return versions
    .map((v) => ({
      label: v.label,
      changes: v.changes,
    }))
    .filter((v) => v.changes.length > 0);
}
