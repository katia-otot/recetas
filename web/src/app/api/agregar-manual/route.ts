import { NextRequest, NextResponse } from "next/server";
import { createManualRecipe } from "@/lib/create-manual-recipe";
import { requireUser } from "@/lib/session-user";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title : "";
    const ingredientsText =
      typeof body.ingredientsText === "string" ? body.ingredientsText : "";
    const stepsText = typeof body.stepsText === "string" ? body.stepsText : "";
    const listId = typeof body.listId === "string" ? body.listId : undefined;
    const extraNotes =
      typeof body.extraNotes === "string" ? body.extraNotes : undefined;

    const result = await createManualRecipe({
      title,
      ingredientsText,
      stepsText,
      userId: user.id,
      listId,
      extraNotes,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
