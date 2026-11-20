import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getListAccessForUser } from "@/lib/lists";
import { requireUser } from "@/lib/session-user";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: listId, userId: memberUserId } = await context.params;
  const access = await getListAccessForUser(user.id, listId);
  if (!access?.isOwner) {
    return NextResponse.json(
      { error: "Solo el dueño puede cambiar permisos" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body.canEdit !== "boolean") {
    return NextResponse.json({ error: "Falta canEdit" }, { status: 400 });
  }

  const membership = await prisma.recipeListMember.findUnique({
    where: { listId_userId: { listId, userId: memberUserId } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
  }

  const updated = await prisma.recipeListMember.update({
    where: { id: membership.id },
    data: { canEdit: body.canEdit },
  });

  return NextResponse.json({ member: updated });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: listId, userId: memberUserId } = await context.params;
  const access = await getListAccessForUser(user.id, listId);
  const isSelf = user.id === memberUserId;

  if (!access?.isOwner && !isSelf) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const list = await prisma.recipeList.findUnique({ where: { id: listId } });
  if (!list) {
    return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
  }
  if (list.ownerId === memberUserId) {
    return NextResponse.json(
      { error: "El dueño no puede quitarse de la lista" },
      { status: 400 },
    );
  }

  await prisma.recipeListMember.deleteMany({
    where: { listId, userId: memberUserId },
  });

  return NextResponse.json({ ok: true });
}
