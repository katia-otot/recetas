import { NextRequest, NextResponse } from "next/server";
import {
  INVITE_COOKIE,
  INVITE_COOKIE_MAX_AGE,
  acceptInvite,
  findActiveInviteByToken,
} from "@/lib/lists";
import { requireUser } from "@/lib/session-user";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const invite = await findActiveInviteByToken(token);
  if (!invite) {
    return NextResponse.json(
      { error: "La invitación no es válida o expiró" },
      { status: 404 },
    );
  }

  const response = NextResponse.json({
    list: { id: invite.list.id, name: invite.list.name },
    canEdit: invite.canEdit,
    email: invite.email,
  });

  response.cookies.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: INVITE_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { token } = await context.params;

  try {
    const result = await acceptInvite(token, user);
    const response = NextResponse.json({ ok: true, ...result });
    response.cookies.set(INVITE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
