import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { claimOrphanRecipes, getUserListAccess } from "@/lib/lists";
import { requireUser } from "@/lib/session-user";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  await claimOrphanRecipes(user.id);
  const access = await getUserListAccess(user.id);
  const listIds = [...access.keys()];

  const lists = await prisma.recipeList.findMany({
    where: { id: { in: listIds } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { recipes: true, members: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    lists: lists.map((list) => {
      const a = access.get(list.id)!;
      return {
        id: list.id,
        name: list.name,
        isDefault: list.isDefault,
        isOwner: a.isOwner,
        canEdit: a.canEdit,
        recipeCount: list._count.recipes,
        memberCount: list._count.members + 1,
        owner: list.owner,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const list = await prisma.recipeList.create({
    data: {
      name,
      ownerId: user.id,
      isDefault: false,
    },
  });

  return NextResponse.json({ list }, { status: 201 });
}
