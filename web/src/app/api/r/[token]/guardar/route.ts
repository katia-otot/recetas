import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  claimOrphanRecipes,
  getUserListAccess,
} from "@/lib/lists";
import { findActiveShareByToken } from "@/lib/recipe-share";
import { requireUser } from "@/lib/session-user";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * Guarda la receta del link compartido en las listas elegidas (editables).
 * No exige canViewRecipe previo: el token del share es la autorización.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { token } = await context.params;
    const share = await findActiveShareByToken(token);
    if (!share) {
      return NextResponse.json(
        { error: "El link no es válido o fue revocado" },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const listIds = Array.isArray(body.listIds)
      ? body.listIds.filter((id: unknown) => typeof id === "string")
      : [];
    if (listIds.length === 0) {
      return NextResponse.json(
        { error: "Elegí al menos una lista" },
        { status: 400 },
      );
    }

    await claimOrphanRecipes(user.id);
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

    const recipeId = share.recipeId;
    const targetSet = new Set(listIds as string[]);

    await prisma.$transaction(async (tx) => {
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
    });

    return NextResponse.json({
      ok: true,
      slug: share.recipe.slug,
      recipeId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
