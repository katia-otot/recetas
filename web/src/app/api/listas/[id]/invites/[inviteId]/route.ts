import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getListAccessForUser } from "@/lib/lists";
import { requireUser } from "@/lib/session-user";

type RouteContext = { params: Promise<{ id: string; inviteId: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: listId, inviteId } = await context.params;
  const access = await getListAccessForUser(user.id, listId);
  if (!access?.isOwner) {
    return NextResponse.json(
      { error: "Solo el dueño puede revocar invitaciones" },
      { status: 403 },
    );
  }

  const invite = await prisma.recipeListInvite.findFirst({
    where: { id: inviteId, listId },
  });
  if (!invite) {
    return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 });
  }

  await prisma.recipeListInvite.update({
    where: { id: inviteId },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
