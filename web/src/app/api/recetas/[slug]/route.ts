import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  formatIngredient,
  parseStoredIngredients,
  type CfeData,
  type Ingredient,
} from "@/lib/recipe-schema";
import { uniqueSlug } from "@/lib/slug";
import { rebuildCfeFromClassic } from "@/lib/structure-recipe";
import {
  classicFromCfe,
  classicSignature,
  parseCfeFromEdit,
} from "@/lib/sync-recipe-formats";

type RouteContext = { params: Promise<{ slug: string }> };

function linesToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseIngredientLines(
  text: string,
  previous: Ingredient[],
): Ingredient[] {
  const lines = linesToList(text);
  return lines.map((line, index) => {
    const prev = previous[index];
    if (prev && formatIngredient(prev, "original") === line) {
      return prev;
    }
    return {
      name: line,
      quantity: undefined,
      unit: undefined,
      prep: undefined,
      grams: undefined,
      ml: undefined,
      metricEstimated: undefined,
    };
  });
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { slug } = await context.params;
    const recipe = await prisma.recipe.findUnique({ where: { slug } });
    if (!recipe) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    await prisma.recipe.delete({ where: { id: recipe.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const recipe = await prisma.recipe.findUnique({ where: { slug } });
    if (!recipe) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const syncFrom = body.syncFrom === "cfe" ? "cfe" : "classic";

    const title =
      typeof body.title === "string" ? body.title.trim() : recipe.title;
    if (!title) {
      return NextResponse.json({ error: "El título es obligatorio" }, { status: 400 });
    }

    const previousIngredients = recipe.ingredientsJson
      ? parseStoredIngredients(JSON.parse(recipe.ingredientsJson))
      : [];
    const previousSteps: string[] = recipe.stepsJson
      ? JSON.parse(recipe.stepsJson)
      : [];
    const previousCfe: CfeData | null = recipe.cfeJson
      ? JSON.parse(recipe.cfeJson)
      : null;

    const extraNotes =
      typeof body.extraNotes === "string"
        ? body.extraNotes.trim() || null
        : recipe.extraNotes;

    const tags =
      typeof body.tagsText === "string"
        ? body.tagsText
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean)
        : recipe.tagsJson
          ? JSON.parse(recipe.tagsJson)
          : [];

    const cuisines =
      typeof body.cuisinesText === "string"
        ? body.cuisinesText
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean)
        : recipe.cuisineJson
          ? JSON.parse(recipe.cuisineJson)
          : [];

    let ingredients = previousIngredients;
    let steps = previousSteps;
    let cfe: CfeData | null = previousCfe;
    let syncNote: string | null = null;

    if (syncFrom === "cfe") {
      const parsed = parseCfeFromEdit({
        prepText: typeof body.cfePrepText === "string" ? body.cfePrepText : "",
        ingredientsText:
          typeof body.cfeIngredientsText === "string"
            ? body.cfeIngredientsText
            : "",
        actionsText:
          typeof body.cfeActionsText === "string" ? body.cfeActionsText : "",
        finalText:
          typeof body.cfeFinalText === "string" ? body.cfeFinalText : "Servir",
      });

      if (!parsed) {
        return NextResponse.json(
          {
            error:
              "No se pudo armar la tabla CFE. Revisá ingredientes (id | label) y acciones (Verbo | ids).",
          },
          { status: 400 },
        );
      }

      cfe = parsed;
      const classic = classicFromCfe(parsed);
      ingredients = classic.ingredients;
      steps = classic.steps;
      syncNote = "CFE guardada; se actualizó el formato clásico.";
    } else {
      ingredients =
        typeof body.ingredientsText === "string"
          ? parseIngredientLines(body.ingredientsText, previousIngredients)
          : previousIngredients;

      steps =
        typeof body.stepsText === "string"
          ? linesToList(body.stepsText)
          : previousSteps;

      const before = classicSignature({
        ingredients: previousIngredients,
        steps: previousSteps,
      });
      const after = classicSignature({ ingredients, steps });
      const classicChanged = before !== after;

      if (classicChanged && ingredients.length > 0 && steps.length > 0) {
        const rebuilt = await rebuildCfeFromClassic({
          title,
          ingredients,
          steps,
        });
        if (rebuilt) {
          cfe = rebuilt;
          syncNote = "Formato clásico guardado; se regeneró la tabla CFE.";
        } else {
          // Clásico cambió pero no se pudo regenerar: invalidar CFE vieja
          // para no mostrar una tabla desactualizada.
          cfe = null;
          syncNote =
            "Formato clásico guardado; no se pudo regenerar la CFE (revisá pasos/ingredientes).";
        }
      }
    }

    let nextSlug = recipe.slug;
    if (title !== recipe.title) {
      nextSlug = await uniqueSlug(title, async (candidate) => {
        if (candidate === recipe.slug) return false;
        const found = await prisma.recipe.findUnique({
          where: { slug: candidate },
        });
        return found !== null;
      });
    }

    const updated = await prisma.recipe.update({
      where: { id: recipe.id },
      data: {
        title,
        slug: nextSlug,
        ingredientsJson: JSON.stringify(ingredients),
        stepsJson: JSON.stringify(steps),
        cfeJson: cfe ? JSON.stringify(cfe) : null,
        ingredientIndex: JSON.stringify(
          ingredients.map((i) => i.name.toLowerCase()),
        ),
        tagsJson: JSON.stringify(tags),
        cuisineJson: JSON.stringify(cuisines),
        extraNotes,
        status:
          ingredients.length > 0 && steps.length > 0
            ? "estructurado"
            : recipe.status,
      },
    });

    return NextResponse.json({
      ok: true,
      slug: updated.slug,
      syncNote,
      hasCfe: Boolean(cfe),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
