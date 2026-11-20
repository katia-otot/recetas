import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getListAccessForUser, newInviteToken } from "@/lib/lists";
import { requireUser } from "@/lib/session-user";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: listId } = await context.params;
  const access = await getListAccessForUser(user.id, listId);
  if (!access?.isOwner) {
    return NextResponse.json(
      { error: "Solo el dueño puede invitar" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const canEdit = Boolean(body.canEdit);
  const email =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim().toLowerCase()
      : null;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const invite = await prisma.recipeListInvite.create({
    data: {
      listId,
      token: newInviteToken(),
      email,
      canEdit,
      createdById: user.id,
      // Link válido 30 días; se puede regenerar
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });

  return NextResponse.json(
    {
      invite: {
        id: invite.id,
        token: invite.token,
        email: invite.email,
        canEdit: invite.canEdit,
        expiresAt: invite.expiresAt,
      },
    },
    { status: 201 },
  );
}
