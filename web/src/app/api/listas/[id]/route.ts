import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getListAccessForUser } from "@/lib/lists";
import { requireUser } from "@/lib/session-user";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await context.params;
  const access = await getListAccessForUser(user.id, id);
  if (!access) {
    return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
  }

  const list = await prisma.recipeList.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      invites: {
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
      },
      recipes: {
        include: {
          recipe: {
            select: {
              id: true,
              title: true,
              slug: true,
              status: true,
              rawText: true,
            },
          },
        },
        orderBy: { addedAt: "desc" },
      },
    },
  });

  if (!list) {
    return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
  }

  return NextResponse.json({
    list: {
      id: list.id,
      name: list.name,
      isDefault: list.isDefault,
      isOwner: access.isOwner,
      canEdit: access.canEdit,
      owner: list.owner,
      members: list.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        canEdit: m.canEdit,
        user: m.user,
      })),
      invites: access.isOwner
        ? list.invites.map((inv) => ({
            id: inv.id,
            token: inv.token,
            email: inv.email,
            canEdit: inv.canEdit,
            expiresAt: inv.expiresAt,
            createdAt: inv.createdAt,
          }))
        : [],
      recipes: list.recipes.map((item) => item.recipe),
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await context.params;
  const access = await getListAccessForUser(user.id, id);
  if (!access?.isOwner) {
    return NextResponse.json({ error: "Solo el dueño puede renombrar" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const list = await prisma.recipeList.update({
    where: { id },
    data: { name },
  });

  return NextResponse.json({ list });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await context.params;
  const access = await getListAccessForUser(user.id, id);
  if (!access?.isOwner) {
    return NextResponse.json({ error: "Solo el dueño puede borrar" }, { status: 403 });
  }

  const list = await prisma.recipeList.findUnique({ where: { id } });
  if (!list) {
    return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
  }
  if (list.isDefault) {
    return NextResponse.json(
      { error: "No se puede borrar la lista Personal" },
      { status: 400 },
    );
  }

  await prisma.recipeList.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
