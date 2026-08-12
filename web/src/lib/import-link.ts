import { prisma } from "@/lib/db";
import { uniqueSlug } from "@/lib/slug";
import { fetchRecipeSourceText } from "@/lib/source-content";
import { structureRecipeWithAi } from "@/lib/structure-recipe";

export type LinkImportResult = {
  recipeId: string;
  slug: string;
  title: string;
  status: string;
};

/**
 * Importa una receta desde URL: descarga texto → guarda → estructura con IA.
 * Solo queda lista en la biblioteca si la estructuración termina bien.
 */
export async function importRecipeFromUrl(url: string): Promise<LinkImportResult> {
  const normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error("El link debe empezar con http:// o https://");
  }

  if (/youtube\.com|youtu\.be|instagram\.com|tiktok\.com/i.test(normalized)) {
    throw new Error(
      "Por ahora solo se admiten links de texto (blogs/recetas), no videos ni Instagram.",
    );
  }

  const sourceText = await fetchRecipeSourceText(normalized);
  if (!sourceText) {
    throw new Error("No se pudo extraer texto de la receta desde ese link");
  }

  const titleGuess =
    sourceText.match(/"name"\s*:\s*"([^"]+)"/)?.[1] ??
    new URL(normalized).pathname.split("/").filter(Boolean).at(-1)?.replace(/-/g, " ") ??
    "Receta desde link";

  const title = titleGuess.slice(0, 120);
  const slug = await uniqueSlug(title, async (candidate) => {
    const found = await prisma.recipe.findUnique({ where: { slug: candidate } });
    return found !== null;
  });

  const recipe = await prisma.recipe.create({
    data: {
      title,
      slug,
      rawText: sourceText.slice(0, 20_000),
      status: "importado",
      sources: {
        create: [{ url: normalized, isPrimary: true }],
      },
    },
  });

  try {
    await structureRecipeWithAi(recipe.id);
  } catch (error) {
    // La receta queda guardada con error_ia; no aparece en biblioteca lista.
    throw new Error(
      `Se guardó el texto, pero falló la estructuración: ${(error as Error).message}`,
    );
  }

  const updated = await prisma.recipe.findUniqueOrThrow({
    where: { id: recipe.id },
  });

  return {
    recipeId: updated.id,
    slug: updated.slug,
    title: updated.title,
    status: updated.status,
  };
}
