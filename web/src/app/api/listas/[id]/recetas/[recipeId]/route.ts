import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getListAccessForUser } from "@/lib/lists";
import { requireUser } from "@/lib/session-user";

type RouteContext = { params: Promise<{ id: string; recipeId: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: listId, recipeId } = await context.params;
  const access = await getListAccessForUser(user.id, listId);
  if (!access?.canEdit) {
    return NextResponse.json(
      { error: "No tenés permiso para quitar recetas de esta lista" },
      { status: 403 },
    );
  }

  await prisma.recipeListItem.deleteMany({
    where: { listId, recipeId },
  });

  return NextResponse.json({ ok: true });
}
