import { prisma } from "./db";
import {
  assembleCfe,
  buildCfeIngredients,
  cfeNeedsAiRepair,
  diagnoseCfeIssues,
  isUsableCfe,
  normalizeAndValidateCfe,
  type CfeIssue,
} from "./cfe";
import { chatCompletion, type ChatMessage } from "./openrouter";
import {
  extractUrls,
  fetchRecipeSources,
  isUnusableRecipeUrl,
} from "./source-content";
import {
  collectSearchTerms,
  enrichIngredientMetrics,
  serializeVersions,
  StructuredRecipeSchema,
  type CfeData,
  type StructuredRecipe,
} from "./recipe-schema";
import {
  CFE_ACTIONS_SYSTEM,
  CFE_KNOWN_FAILURES,
  CFE_RULES_FOR_STRUCTURE,
} from "./cfe-ai-rules";

const SYSTEM_PROMPT = `Eres un experto en cocina. Convertís texto de recetas (a menudo desordenado) en JSON estructurado en español.

Reglas generales:
- TODO el contenido generado debe estar en español (traducí si la fuente está en inglés).
- NO inventes ingredientes ni pasos que no estén en la fuente de la receta.
- Si hay "Contenido de la receta" extraído de un link, ESA es la receta principal (ingredientes + pasos + CFE). Las notas del usuario no reemplazan al link.
- Si el contenido trae "Texto visible" y "Datos estructurados (JSON-LD)", usá las DOS: completate entre ellas y verificá. Si el JSON tiene menos ingredientes o pasos que el HTML, priorizá el HTML. El JSON puede aportar porciones, tiempos o nombres más limpios.
- Si ves una lista "Ingredientes" con varios ítems, extraé TODOS. No te quedes con un solo keyword tipo "harina de trigo" si más abajo hay cantidades (500g harina, levadura, etc.).
- Ingredientes con cantidades cuando consten; si no hay cantidad, dejá quantity/unit vacíos.
- Equivalencias métricas: si hay quantity + unit convertible (taza, cucharada, oz, g, ml), SIEMPRE llená grams o ml.
  - sólidos/densos → "grams" (ej. "115")
  - líquidos → "ml" (ej. "60")
  - Si es aproximación (taza de harina, etc.) metricEstimated: true
  - Solo omití grams/ml si no hay cantidad (al gusto, una pizca, 1 huevo).
- Pasos en orden lógico de cocina.
- tags: estilo o tipo (pasta, ensalada, horno, etc.)
- cuisines: origen culinario si se deduce.

NOTAS PERSONALES Y VERSIONES (muy importante):
- personalNotes y versions SOLO pueden salir de la sección NOTAS_DEL_USUARIO.
- Si NOTAS_DEL_USUARIO está vacía → personalNotes: [] y versions: [].
- NUNCA uses comentarios, reseñas, fechas de copyright ni texto de blogs/fuentes web como personalNotes o versions.
- NUNCA inventes historial ("2021 primera versión", "se mejoró la mezcla", etc.).
- versions solo si el usuario escribió pruebas distintas con fecha/etiqueta real ("2024:", "12/2/24", "probé con…"). Cada version: label + changes (lista corta de diferencias concretas). No dupliques la receta entera.

${CFE_RULES_FOR_STRUCTURE}

Responde ÚNICAMENTE con JSON válido, sin markdown.`;

function buildUserPrompt(input: {
  title: string;
  rawText?: string | null;
  extraNotes?: string | null;
  sourceUrls?: string[];
  sourceTexts?: Array<{ url: string; text: string }>;
}): string {
  const parts = [`Título: ${input.title}`];

  if (input.sourceUrls?.length) {
    parts.push(`Enlaces (contexto de la receta):\n${input.sourceUrls.join("\n")}`);
  }

  if (input.sourceTexts?.length) {
    parts.push(
      `Contenido de la receta (ignorar comentarios/reseñas de terceros si aparecieran):\n${input.sourceTexts
        .map((source) => `FUENTE: ${source.url}\n${source.text}`)
        .join("\n\n")}`,
    );
  }

  if (input.rawText) {
    parts.push(`Texto principal de la receta:\n${input.rawText}`);
  }

  parts.push(
    `NOTAS_DEL_USUARIO (única fuente permitida para personalNotes y versions; si está vacío no inventes nada):\n${
      input.extraNotes?.trim() || "(vacío)"
    }`,
  );

  parts.push(`
Esquema JSON:
{
  "title": "string",
  "servings": number | null,
  "ingredients": [{ "name": "string", "quantity": "string?", "unit": "string?", "prep": "string?", "grams": "string?", "ml": "string?", "metricEstimated": true }],
  "steps": ["string"],
  "personalNotes": [],
  "tags": ["string"],
  "cuisines": ["string"],
  "cfe": {
    "prepRows": [],
    "ingredients": [{ "id": "pasta", "label": "170 g pasta fusilli" }],
    "actions": [{ "column": 1, "verb": "Hervir", "ingredientIds": ["pasta"], "duration": "al dente", "dependsOn": [] }],
    "finalAction": { "verb": "Servir", "tempC": null, "tempF": null, "duration": "", "notes": "" }
  },
  "versions": []
}`);

  return parts.join("\n\n");
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  let jsonText = fenced ? fenced[1].trim() : trimmed;

  if (!jsonText.startsWith("{") && !jsonText.startsWith("[")) {
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      jsonText = jsonText.slice(start, end + 1);
    }
  }

  return JSON.parse(jsonText);
}

async function completeStructuredRecipe(
  messages: ChatMessage[],
): Promise<{ structured: StructuredRecipe; model: string }> {
  let lastError: Error | null = null;
  let conversation = [...messages];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await chatCompletion(conversation);
    try {
      const structured = StructuredRecipeSchema.parse(
        parseJsonContent(completion.content),
      );
      const hasClassic =
        structured.ingredients.length > 0 && structured.steps.length > 0;
      const incompleteList =
        structured.ingredients.length === 1 && structured.steps.length > 0;
      if ((!hasClassic || incompleteList) && attempt === 0) {
        conversation = [
          ...conversation,
          { role: "assistant", content: completion.content },
          {
            role: "user",
            content: incompleteList
              ? "La lista de ingredientes está incompleta (un solo ítem). Extraé TODOS los ingredientes con cantidad de la sección Ingredientes del contenido, y devolvé el JSON completo. Solo JSON."
              : "Faltan ingredients y/o steps. Usá el contenido del LINK (o el texto de la receta) y devolvé TODO el JSON completo, con ingredientes, pasos y cfe. Solo JSON.",
          },
        ];
        continue;
      }
      return { structured, model: completion.model };
    } catch (error) {
      lastError = error as Error;
      conversation = [
        ...conversation,
        { role: "assistant", content: completion.content },
        {
          role: "user",
          content:
            "Tu respuesta no fue un JSON válido según el esquema. Devuelve ÚNICAMENTE el objeto JSON completo, sin texto antes ni después.",
        },
      ];
    }
  }

  throw lastError ?? new Error("No se pudo parsear la respuesta de la IA");
}

function versionTimestamp(label: string): number {
  const fullYear = label.match(/\b(20\d{2})\b/);
  if (fullYear) return Number(fullYear[1]) * 10_000;

  const date = label.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!date) return 0;

  const day = Number(date[1]);
  const month = Number(date[2]);
  let year = date[3] ? Number(date[3]) : 0;
  if (year > 0 && year < 100) year += 2000;
  return year * 10_000 + month * 100 + day;
}

function sortVersionsByDate(
  versions: NonNullable<StructuredRecipe["versions"]>,
): NonNullable<StructuredRecipe["versions"]> {
  return [...versions].sort(
    (a, b) => versionTimestamp(b.label) - versionTimestamp(a.label),
  );
}

const GENERIC_VERSION_CHANGE =
  /primera versi[oó]n|versi[oó]n (inicial|original|anterior)|se mejor[oó]|mejora(ste)? (la|el)|actualizaci[oó]n general|cambios menores/i;

function userNotesAllowVersions(extraNotes: string | null | undefined): boolean {
  if (!extraNotes?.trim()) return false;
  return /20\d{2}|\d{1,2}\/\d{1,2}|upd\.?|prob[eé]|versi[oó]n|la [uú]ltima|probamos|en vez de|en lugar de/i.test(
    extraNotes,
  );
}

/** Solo versions reales del usuario; nunca inventadas ni desde la web. */
export function sanitizeVersions(
  versions: StructuredRecipe["versions"] | undefined,
  extraNotes: string | null | undefined,
): NonNullable<StructuredRecipe["versions"]> {
  if (!userNotesAllowVersions(extraNotes)) return [];
  if (!versions?.length) return [];

  return sortVersionsByDate(
    versions
      .map((version) => ({
        label: version.label.trim(),
        changes: version.changes.filter(
          (change) => change.trim() && !GENERIC_VERSION_CHANGE.test(change),
        ),
      }))
      .filter((version) => version.label && version.changes.length > 0),
  );
}

function formatIssuesForRepair(issues: CfeIssue[]): string {
  return issues.map((issue) => `- [${issue.code}] ${issue.detail}`).join("\n");
}

async function completeCfeActions(input: {
  title: string;
  ingredients: CfeData["ingredients"];
  steps: string[];
  feedback?: CfeIssue[];
}): Promise<CfeData | null> {
  if (input.ingredients.length === 0 || input.steps.length === 0) return null;

  const feedbackBlock =
    input.feedback && input.feedback.length > 0
      ? `\n\nCORRECCIONES OBLIGATORIAS (el intento anterior falló el diagnóstico):\n${formatIssuesForRepair(input.feedback)}\n\nErrores típicos a evitar:\n${CFE_KNOWN_FAILURES.map((f) => `- ${f}`).join("\n")}\nRehacé el grafo entero arreglando esos puntos. No inventes ingredientes.`
      : "";

  const messages: ChatMessage[] = [
    { role: "system", content: CFE_ACTIONS_SYSTEM },
    {
      role: "user",
      content: `Receta: ${input.title}

INGREDIENTES_FIJOS:
${JSON.stringify(input.ingredients, null, 2)}

PASOS:
${input.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}${feedbackBlock}`,
    },
  ];

  try {
    const completion = await chatCompletion(messages, {
      temperature: input.feedback?.length ? 0.15 : 0.1,
      maxTokens: 4096,
    });
    const parsed = parseJsonContent(completion.content) as {
      prepRows?: unknown;
      actions?: CfeData["actions"];
      finalAction?: CfeData["finalAction"];
    };

    const assembled = assembleCfe({
      ingredients: input.ingredients,
      actions: parsed.actions ?? [],
      finalAction: parsed.finalAction,
      prepRows: Array.isArray(parsed.prepRows)
        ? parsed.prepRows.map(String)
        : [],
      steps: input.steps,
    });

    if (assembled) return assembled;

    // Último recurso: reintentar ensamble listando ids que faltaron en la respuesta.
    const used = new Set(
      (parsed.actions ?? []).flatMap((action) => action.ingredientIds ?? []),
    );
    const missing = input.ingredients
      .map((ing) => ing.id)
      .filter((id) => !used.has(id));
    if (missing.length === 0) return null;

    const patchedActions = [
      ...(parsed.actions ?? []),
      {
        column: 99,
        verb: missing.length <= 2 ? "Decorar" : "Incorporar",
        ingredientIds: missing,
        dependsOn: parsed.actions?.length
          ? [parsed.actions.length]
          : undefined,
      },
    ];
    return assembleCfe({
      ingredients: input.ingredients,
      actions: patchedActions,
      finalAction: parsed.finalAction,
      prepRows: Array.isArray(parsed.prepRows)
        ? parsed.prepRows.map(String)
        : [],
      steps: input.steps,
    });
  } catch {
    return null;
  }
}

async function completeCfeActionsWithRepair(input: {
  title: string;
  ingredients: CfeData["ingredients"];
  steps: string[];
}): Promise<CfeData | null> {
  let best = await completeCfeActions(input);
  if (!best || !isUsableCfe(best)) return best;

  const diagOpts = { steps: input.steps };
  let bestIssues = diagnoseCfeIssues(best, diagOpts);
  if (!cfeNeedsAiRepair(bestIssues)) return best;

  // Hasta 2 reintentos con el feedback del diagnóstico.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const candidate = await completeCfeActions({
      ...input,
      feedback: bestIssues.filter((i) => cfeNeedsAiRepair([i])),
    });
    if (!candidate || !isUsableCfe(candidate)) continue;

    const candidateIssues = diagnoseCfeIssues(candidate, diagOpts);
    const bestSerious = bestIssues.filter((i) => cfeNeedsAiRepair([i])).length;
    const candidateSerious = candidateIssues.filter((i) =>
      cfeNeedsAiRepair([i]),
    ).length;

    if (candidateSerious < bestSerious) {
      best = candidate;
      bestIssues = candidateIssues;
    } else if (candidateSerious === bestSerious) {
      // Preferir el nuevo si al menos no empeoró (puede arreglar non_contiguous).
      best = candidate;
      bestIssues = candidateIssues;
    }

    if (!cfeNeedsAiRepair(bestIssues)) break;
  }

  return best;
}

/**
 * Normaliza CFE: labels canónicos desde ingredientes.
 * Si falla o el diagnóstico semántico es malo, intenta pase(s) solo de acciones.
 * Si sigue mal → null (no se muestra en la UI).
 */
async function resolveCfe(
  structured: StructuredRecipe,
): Promise<CfeData | null> {
  const fixedIngredients = buildCfeIngredients(structured.ingredients);
  const first = normalizeAndValidateCfe(structured);

  if (first && isUsableCfe(first)) {
    const diagOpts = { steps: structured.steps };
    const issues = diagnoseCfeIssues(first, diagOpts);
    if (!cfeNeedsAiRepair(issues)) return first;

    const repaired = await completeCfeActionsWithRepair({
      title: structured.title,
      ingredients: fixedIngredients,
      steps: structured.steps,
    });
    if (repaired && isUsableCfe(repaired)) {
      const repairedIssues = diagnoseCfeIssues(repaired, diagOpts);
      const before = issues.filter((i) => cfeNeedsAiRepair([i])).length;
      const after = repairedIssues.filter((i) => cfeNeedsAiRepair([i])).length;
      if (after <= before) return repaired;
    }
    return first;
  }

  const repaired = await completeCfeActionsWithRepair({
    title: structured.title,
    ingredients: fixedIngredients,
    steps: structured.steps,
  });

  if (repaired && isUsableCfe(repaired)) return repaired;
  return null;
}

/** Regenera CFE a partir del formato clásico (ingredientes + pasos). */
export async function rebuildCfeFromClassic(input: {
  title: string;
  ingredients: StructuredRecipe["ingredients"];
  steps: string[];
}): Promise<CfeData | null> {
  if (input.ingredients.length === 0 || input.steps.length === 0) return null;

  const fixedIngredients = buildCfeIngredients(input.ingredients);
  const rebuilt = await completeCfeActionsWithRepair({
    title: input.title,
    ingredients: fixedIngredients,
    steps: input.steps,
  });

  return rebuilt && isUsableCfe(rebuilt) ? rebuilt : null;
}

export async function structureRecipeWithAi(recipeId: string): Promise<{
  structured: StructuredRecipe;
  model: string;
}> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { sources: true },
  });

  if (!recipe) {
    throw new Error("Receta no encontrada");
  }

  const discoveredUrls = [
    ...new Set([
      ...recipe.sources.map((source) => source.url),
      ...extractUrls(
        [recipe.title, recipe.rawText, recipe.extraNotes].filter(Boolean).join("\n"),
      ),
    ]),
  ];
  const fetchableUrls = discoveredUrls.filter((url) => !isUnusableRecipeUrl(url));

  for (const url of fetchableUrls) {
    if (recipe.sources.some((source) => source.url === url)) continue;
    await prisma.recipeSource.create({
      data: { recipeId: recipe.id, url, isPrimary: recipe.sources.length === 0 },
    });
  }

  const hasText =
    Boolean(recipe.rawText?.trim()) ||
    Boolean(recipe.extraNotes?.trim()) ||
    recipe.title.trim().length > 40;

  if (!hasText && fetchableUrls.length === 0 && discoveredUrls.length > 0) {
    await prisma.recipe.update({
      where: { id: recipeId },
      data: {
        status: "incompleta",
        structureError:
          "El link es de video/Instagram/TikTok: no se puede extraer la receta",
      },
    });
    throw new Error("El link no es de una receta en texto");
  }

  if (!hasText && fetchableUrls.length === 0) {
    await prisma.recipe.update({
      where: { id: recipeId },
      data: {
        status: "incompleta",
        structureError: "No hay texto ni enlace para reconstruir la receta",
      },
    });
    throw new Error("La receta no tiene texto para procesar");
  }

  await prisma.recipe.update({
    where: { id: recipeId },
    data: { status: "procesando", structureError: null },
  });

  try {
    const sourceTexts = await fetchRecipeSources(fetchableUrls);

    if (fetchableUrls.length > 0 && sourceTexts.length === 0 && !hasText) {
      throw new Error(
        "No se pudo extraer el texto del link (igual que al importar un enlace)",
      );
    }

    const rawForModel = [
      recipe.rawText?.trim(),
      !recipe.rawText && recipe.title.trim().length > 40 ? recipe.title : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const userPrompt = buildUserPrompt({
      title: recipe.title,
      rawText: rawForModel || null,
      extraNotes: recipe.extraNotes,
      sourceUrls: fetchableUrls,
      sourceTexts,
    });
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    const { structured: rawStructured, model } =
      await completeStructuredRecipe(messages);

    rawStructured.ingredients = rawStructured.ingredients.map(
      enrichIngredientMetrics,
    );

    if (
      rawStructured.ingredients.length === 0 ||
      rawStructured.steps.length === 0
    ) {
      throw new Error(
        "La IA no pudo armar ingredientes y pasos (revisar el link o el texto)",
      );
    }

    const versions = sanitizeVersions(rawStructured.versions, recipe.extraNotes);
    const cfe = await resolveCfe(rawStructured);

    const structured: StructuredRecipe = {
      ...rawStructured,
      versions,
      // personalNotes de la IA no se persisten; solo sirven de paso intermedio
      personalNotes: [],
      cfe: cfe ?? {
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
    };

    const versionsStored =
      versions.length > 0 ? serializeVersions(versions) : null;

    await prisma.recipe.update({
      where: { id: recipeId },
      data: {
        title: structured.title || recipe.title,
        ingredientsJson: JSON.stringify(structured.ingredients),
        stepsJson: JSON.stringify(structured.steps),
        cfeJson: cfe ? JSON.stringify(cfe) : null,
        versionsJson: versionsStored ? JSON.stringify(versionsStored) : null,
        ingredientIndex: JSON.stringify(collectSearchTerms(structured)),
        tagsJson: JSON.stringify(structured.tags),
        cuisineJson: JSON.stringify(structured.cuisines),
        // Nunca pisar ni inventar notas: solo las del Sheet / edición manual
        extraNotes: recipe.extraNotes,
        status: "estructurado",
        structureError: null,
      },
    });

    return { structured, model };
  } catch (e) {
    const message = (e as Error).message;
    await prisma.recipe.update({
      where: { id: recipeId },
      data: { status: "error_ia", structureError: message },
    });
    throw e;
  }
}

export async function structureRecipeIfNeeded(recipeId: string): Promise<void> {
  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
  if (!recipe) return;
  if (recipe.status === "estructurado") return;
  await structureRecipeWithAi(recipeId);
}

/** Statuses that still need a first pass (or a retry after IA error). */
const PENDING_STATUSES = ["importado", "error_ia", "procesando"] as const;

/**
 * Redo = pendientes + ya estructuradas (rehacer CFE/pasos con el modelo actual).
 * Omite `incompleta` (links de video / sin texto extraíble).
 */
const REDO_STATUSES = [
  ...PENDING_STATUSES,
  "estructurado",
] as const;

export async function structureAllPending(options?: {
  delayMs?: number;
  limit?: number;
  /** Si true, también reestructura las ya marcadas como estructurado. */
  redo?: boolean;
}): Promise<{ ok: number; failed: number; skipped: number; errors: string[] }> {
  const delayMs = options?.delayMs ?? 1500;
  const limit = options?.limit ?? 500;
  const redo = options?.redo ?? false;
  const statuses = redo ? [...REDO_STATUSES] : [...PENDING_STATUSES];

  const pending = await prisma.recipe.findMany({
    where: { status: { in: statuses } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, title: true, status: true },
  });

  let ok = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  console.log(
    `Batch: ${pending.length} recetas (modo ${redo ? "redo" : "pending"})`,
  );

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    try {
      await structureRecipeWithAi(item.id);
      ok += 1;
      console.log(`[${i + 1}/${pending.length}] OK: ${item.title}`);
    } catch (e) {
      const message = (e as Error).message;
      // incompleta / sin fuente: no contar como fallo duro del batch
      if (
        message.includes("no es de una receta") ||
        message.includes("no tiene texto")
      ) {
        skipped += 1;
        console.warn(`[${i + 1}/${pending.length}] SKIP: ${item.title}: ${message}`);
      } else {
        failed += 1;
        const msg = `${item.title}: ${message}`;
        errors.push(msg);
        console.error(`[${i + 1}/${pending.length}] FAIL: ${msg}`);
      }
    }

    if (i < pending.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { ok, failed, skipped, errors };
}
