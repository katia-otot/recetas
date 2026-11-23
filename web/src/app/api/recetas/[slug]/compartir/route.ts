import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canViewRecipe } from "@/lib/lists";
import { getOrCreateRecipeShareLink } from "@/lib/recipe-share";
import { requireUser } from "@/lib/session-user";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { slug } = await context.params;
    const recipe = await prisma.recipe.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!recipe || !(await canViewRecipe(user.id, recipe.id))) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    const share = await getOrCreateRecipeShareLink(recipe.id, user.id);
    return NextResponse.json({
      ok: true,
      token: share.token,
      path: `/r/${share.token}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
