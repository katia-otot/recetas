import { NextRequest, NextResponse } from "next/server";
import {
  SHARE_COOKIE,
  SHARE_COOKIE_MAX_AGE,
  findActiveShareByToken,
} from "@/lib/recipe-share";
import { requireUser } from "@/lib/session-user";

type RouteContext = { params: Promise<{ token: string }> };

/** Valida el link y deja cookie para poder loguearse aunque haya allowlist. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const share = await findActiveShareByToken(token);
  if (!share) {
    return NextResponse.json(
      { error: "El link no es válido o fue revocado" },
      { status: 404 },
    );
  }

  const user = await requireUser();
  const response = NextResponse.json({
    ok: true,
    recipe: {
      id: share.recipe.id,
      slug: share.recipe.slug,
      title: share.recipe.title,
    },
    loggedIn: !!user,
  });

  response.cookies.set(SHARE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SHARE_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
