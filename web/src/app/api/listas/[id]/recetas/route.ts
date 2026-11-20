import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canViewRecipe, getListAccessForUser } from "@/lib/lists";
import { requireUser } from "@/lib/session-user";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: listId } = await context.params;
  const access = await getListAccessForUser(user.id, listId);
  if (!access?.canEdit) {
    return NextResponse.json(
      { error: "No tenés permiso para agregar recetas a esta lista" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const recipeId = typeof body.recipeId === "string" ? body.recipeId : "";
  if (!recipeId) {
    return NextResponse.json({ error: "Falta recipeId" }, { status: 400 });
  }

  if (!(await canViewRecipe(user.id, recipeId))) {
    return NextResponse.json(
      { error: "No tenés acceso a esa receta" },
      { status: 403 },
    );
  }

  const item = await prisma.recipeListItem.upsert({
    where: { listId_recipeId: { listId, recipeId } },
    create: { listId, recipeId },
    update: {},
  });

  return NextResponse.json({ item }, { status: 201 });
}
