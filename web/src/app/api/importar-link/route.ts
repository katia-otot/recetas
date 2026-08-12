import { NextRequest, NextResponse } from "next/server";
import { importRecipeFromUrl } from "@/lib/import-link";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = typeof body.url === "string" ? body.url : "";
    if (!url.trim()) {
      return NextResponse.json({ error: "Falta el link" }, { status: 400 });
    }

    const result = await importRecipeFromUrl(url);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
