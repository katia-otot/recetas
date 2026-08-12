import { prisma } from "./db";
import {
  assembleCfe,
  buildCfeIngredients,
  isUsableCfe,
  normalizeAndValidateCfe,
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

const SYSTEM_PROMPT = `Eres un experto en cocina. Convertís texto de recetas (a menudo desordenado) en JSON estructurado en español.

Reglas generales:
- TODO el contenido generado debe estar en español (traducí si la fuente está en inglés).
- NO inventes ingredientes ni pasos que no estén en la fuente de la receta.
- Si hay "Contenido de la receta" extraído de un link, ESA es la receta principal (ingredientes + pasos + CFE). Las notas del usuario no reemplazan al link.
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

CFE / Cooking for Engineers = grafo de dependencias, no una lista plana:
  - Cada action es un nodo. dependsOn = índices 1-based de acciones que DEBEN terminar antes.
  - Las columnas las calcula el sistema: misma columna = en paralelo; más a la derecha = después.
  - Si un paso va DESPUÉS de otro (aunque sea la misma sartén), son DOS actions, no una sola.
    Ejemplo arroz: "saltear ajo 1 min" y LUEGO "saltear espárragos 5-7 min"
      → action1 Saltear ajo (aceite+ajo, duration:"1 min")
      → action2 Saltear espárragos (aceite+ajo+esparragos, duration:"5-7 min", dependsOn:[1])
    NUNCA juntes ajo y espárragos en un solo "Saltear" si la receta los secuencia.
  - duration: tiempo si consta ("1 min", "5-7 min", "20 min", "al dente"). Si no hay tiempo, omitilo.
  - verb: técnica corta (Hervir, Saltear, Mezclar…). El tiempo va en duration, no en el verb.
  - Al unir resultados previos, ingredientIds incluye todas las filas que abarca.
  - Si "después, en la misma sartén, tostar piñones" (sin overlap de ingredientes), igual poné dependsOn.
  - NUNCA pongas Mezclar/Incorporar de TODOS los ingredientes mientras otro grupo todavía se está salteando, asando o hirviendo.
    El merge final depende de TODOS los streams (asar verduras Y el guiso). Listá primero cada cocción, el join al final.
  - "Mezclar con aceite para cubrir" ANTES de hornear es un paso de ese grupo, no el merge final.
  - Ejemplo mental "Pasta caprese" (paralelo + merge):
      Hervir(pasta) ∥ Saltear(aceite+tomates+sal) → Mezclar(esos 4) → Incorporar(todos)
  - Ejemplo feijoada: Asar verduras ∥ Sofreír cebolla→ajo→especias→guiso 20 min → al FINAL mezclar asado+guiso.
  - cfe.ingredients: UNA fila por cada item de "ingredients", mismo orden; label con nombre completo.
  - id en snake_case. column número (se recalcula). NUNCA column="mix".
  - NO uses "combinar" si hay calor/sartén → "saltear" o "cocinar".
  - NUNCA actions con ingredientIds vacío.
  - finalAction SIEMPRE objeto: { "verb":"…", "tempC":null, "tempF":null, "duration":"", "notes":"" }.
  - Si no podés armar un CFE coherente, devolvé cfe con ingredients/actions vacíos.

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
      if (!hasClassic && attempt === 0) {
        conversation = [
          ...conversation,
          { role: "assistant", content: completion.content },
          {
            role: "user",
            content:
              "Faltan ingredients y/o steps. Usá el contenido del LINK (o el texto de la receta) y devolvé TODO el JSON completo, con ingredientes, pasos y cfe. Solo JSON.",
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

async function completeCfeActions(input: {
  title: string;
  ingredients: CfeData["ingredients"];
  steps: string[];
}): Promise<CfeData | null> {
  if (input.ingredients.length === 0 || input.steps.length === 0) return null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `Armás SOLO las acciones CFE (grafo) en español.
Los ingredientes (id + label) son FIJOS: no los cambies ni inventes otros.
Devolvé JSON: { "prepRows": string[], "actions": [{ "column": number, "verb": string, "ingredientIds": string[], "duration": "5-7 min", "dependsOn": [1] }], "finalAction": { "verb": string, "tempC": null, "tempF": null, "duration": "", "notes": "" } }
Reglas: grafo. Paso DESPUÉS de otro = DOS actions + dependsOn (ajo 1 min, luego espárragos 5-7 min). duration si consta. Paralelo solo si no hay dependencia. ingredientIds de la lista; al unir incluí todos los ids; sin vacías; todos los ids en alguna action.`,
    },
    {
      role: "user",
      content: `Receta: ${input.title}

INGREDIENTES_FIJOS:
${JSON.stringify(input.ingredients, null, 2)}

PASOS:
${input.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}`,
    },
  ];

  try {
    const completion = await chatCompletion(messages, {
      temperature: 0.1,
      maxTokens: 2048,
    });
    const parsed = parseJsonContent(completion.content) as {
      prepRows?: unknown;
      actions?: CfeData["actions"];
      finalAction?: CfeData["finalAction"];
    };

    return assembleCfe({
      ingredients: input.ingredients,
      actions: parsed.actions ?? [],
      finalAction: parsed.finalAction,
      prepRows: Array.isArray(parsed.prepRows)
        ? parsed.prepRows.map(String)
        : [],
    });
  } catch {
    return null;
  }
}

/**
 * Normaliza CFE: labels canónicos desde ingredientes.
 * Si falla, intenta un segundo pase solo de acciones.
 * Si sigue mal → null (no se muestra en la UI).
 */
async function resolveCfe(
  structured: StructuredRecipe,
): Promise<CfeData | null> {
  const first = normalizeAndValidateCfe(structured);
  if (first && isUsableCfe(first)) return first;

  const fixedIngredients = buildCfeIngredients(structured.ingredients);
  const repaired = await completeCfeActions({
    title: structured.title,
    ingredients: fixedIngredients,
    steps: structured.steps,
  });

  if (repaired && isUsableCfe(repaired)) return repaired;
  return null;
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
        finalAction: { verb: "Servir" },
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

export async function structureAllPending(options?: {
  delayMs?: number;
  limit?: number;
}): Promise<{ ok: number; failed: number; errors: string[] }> {
  const delayMs = options?.delayMs ?? 1500;
  const limit = options?.limit ?? 500;

  const pending = await prisma.recipe.findMany({
    where: { status: { in: ["importado", "error_ia"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, title: true },
  });

  let ok = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    try {
      await structureRecipeWithAi(item.id);
      ok += 1;
      console.log(`[${i + 1}/${pending.length}] OK: ${item.title}`);
    } catch (e) {
      failed += 1;
      const msg = `${item.title}: ${(e as Error).message}`;
      errors.push(msg);
      console.error(`[${i + 1}/${pending.length}] FAIL: ${msg}`);
    }

    if (i < pending.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { ok, failed, errors };
}
