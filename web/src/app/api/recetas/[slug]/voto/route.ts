import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canViewRecipe } from "@/lib/lists";
import {
  isRecipeVoteValue,
  summarizeRecipeVotes,
} from "@/lib/recipe-votes";
import { requireUser } from "@/lib/session-user";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
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

    const body = await request.json().catch(() => null);
    const value = body && typeof body === "object" ? body.value : null;
    if (!isRecipeVoteValue(value)) {
      return NextResponse.json({ error: "Voto inválido" }, { status: 400 });
    }

    const existing = await prisma.recipeVote.findUnique({
      where: { recipeId_userId: { recipeId: recipe.id, userId: user.id } },
    });

    if (existing?.value === value) {
      await prisma.recipeVote.delete({ where: { id: existing.id } });
    } else if (existing) {
      await prisma.recipeVote.update({
        where: { id: existing.id },
        data: { value },
      });
    } else {
      await prisma.recipeVote.create({
        data: { recipeId: recipe.id, userId: user.id, value },
      });
    }

    const votes = await prisma.recipeVote.findMany({
      where: { recipeId: recipe.id },
      select: { userId: true, value: true },
    });

    return NextResponse.json(summarizeRecipeVotes(votes, user.id));
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
