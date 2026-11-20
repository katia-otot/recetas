import { prisma } from "@/lib/db";
import { claimOrphanRecipes, getUserListAccess } from "@/lib/lists";

export type KeepListNavItem = {
  id: string;
  name: string;
  isDefault: boolean;
  isOwner: boolean;
  canEdit: boolean;
  recipeCount: number;
};

export async function loadKeepNav(userId: string): Promise<{
  lists: KeepListNavItem[];
  personalId: string;
}> {
  await claimOrphanRecipes(userId);
  const access = await getUserListAccess(userId);
  const accessibleListIds = [...access.keys()];

  const rows = await prisma.recipeList.findMany({
    where: { id: { in: accessibleListIds } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { _count: { select: { recipes: true } } },
  });

  const lists: KeepListNavItem[] = rows.map((list) => {
    const a = access.get(list.id)!;
    return {
      id: list.id,
      name: list.name,
      isDefault: list.isDefault,
      isOwner: a.isOwner,
      canEdit: a.canEdit,
      recipeCount: list._count.recipes,
    };
  });

  const personalId =
    lists.find((l) => l.isDefault)?.id ?? lists[0]?.id ?? "";

  return { lists, personalId };
}

export function resolveActiveListId(
  lists: KeepListNavItem[],
  preferredIds: string[],
  fallbackId: string,
): string {
  for (const id of preferredIds) {
    if (lists.some((l) => l.id === id)) return id;
  }
  return fallbackId;
}
