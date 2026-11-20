import { NextRequest, NextResponse } from "next/server";
import { importRecipeFromUrl } from "@/lib/import-link";
import { getListAccessForUser } from "@/lib/lists";
import { requireUser } from "@/lib/session-user";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const url = typeof body.url === "string" ? body.url : "";
    if (!url.trim()) {
      return NextResponse.json({ error: "Falta el link" }, { status: 400 });
    }

    const listId = typeof body.listId === "string" ? body.listId : undefined;
    if (listId) {
      const access = await getListAccessForUser(user.id, listId);
      if (!access?.canEdit) {
        return NextResponse.json(
          { error: "No tenés permiso para agregar a esa lista" },
          { status: 403 },
        );
      }
    }

    const result = await importRecipeFromUrl(url, {
      userId: user.id,
      listId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
