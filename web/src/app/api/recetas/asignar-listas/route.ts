import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canViewRecipe, getUserListAccess } from "@/lib/lists";
import { requireUser } from "@/lib/session-user";

/**
 * Define en qué listas editables quedan las recetas.
 * - listIds marcados → se agregan
 * - listas editables no marcadas → se sacan
 * - listas solo-lectura ajenas no se tocan
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const recipeIds = Array.isArray(body.recipeIds)
    ? body.recipeIds.filter((id: unknown) => typeof id === "string")
    : [];
  const listIds = Array.isArray(body.listIds)
    ? body.listIds.filter((id: unknown) => typeof id === "string")
    : [];

  if (recipeIds.length === 0) {
    return NextResponse.json({ error: "Elegí al menos una receta" }, { status: 400 });
  }
  if (listIds.length === 0) {
    return NextResponse.json(
      { error: "Elegí al menos una lista (si no, la receta quedaría sin lista)" },
      { status: 400 },
    );
  }

  const access = await getUserListAccess(user.id);
  const editableIds = new Set(
    [...access.entries()].filter(([, a]) => a.canEdit).map(([id]) => id),
  );

  for (const listId of listIds) {
    if (!editableIds.has(listId)) {
      return NextResponse.json(
        { error: "No podés editar una de las listas elegidas" },
        { status: 403 },
      );
    }
  }

  for (const recipeId of recipeIds) {
    if (!(await canViewRecipe(user.id, recipeId))) {
      return NextResponse.json(
        { error: "No tenés acceso a una de las recetas" },
        { status: 403 },
      );
    }
  }

  const targetSet = new Set(listIds as string[]);

  await prisma.$transaction(async (tx) => {
    for (const recipeId of recipeIds as string[]) {
      const current = await tx.recipeListItem.findMany({
        where: { recipeId },
        select: { listId: true },
      });

      for (const item of current) {
        if (editableIds.has(item.listId) && !targetSet.has(item.listId)) {
          await tx.recipeListItem.deleteMany({
            where: { recipeId, listId: item.listId },
          });
        }
      }

      for (const listId of targetSet) {
        await tx.recipeListItem.upsert({
          where: { listId_recipeId: { listId, recipeId } },
          create: { listId, recipeId },
          update: {},
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
