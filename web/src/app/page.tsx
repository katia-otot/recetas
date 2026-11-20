import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LibraryClient } from "@/components/keep/LibraryClient";
import { signOutToLogin } from "@/lib/auth-actions";
import { prisma } from "@/lib/db";
import { claimOrphanRecipes, getUserListAccess } from "@/lib/lists";
import { requireUser } from "@/lib/session-user";

type HomeProps = {
  searchParams: Promise<{ q?: string; lista?: string }>;
};

function parseStringArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export default async function Home({ searchParams }: HomeProps) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const session = await auth();
  const { q, lista: listaParam } = await searchParams;
  const query = q?.trim() ?? "";

  await claimOrphanRecipes(user.id);
  const access = await getUserListAccess(user.id);
  const accessibleListIds = [...access.keys()];

  const lists = await prisma.recipeList.findMany({
    where: { id: { in: accessibleListIds } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { _count: { select: { recipes: true } } },
  });

  const personal = lists.find((l) => l.isDefault) ?? lists[0];
  if (!personal) {
    redirect("/login");
  }

  const activeListId =
    listaParam && access.has(listaParam) ? listaParam : personal.id;
  const activeAccess = access.get(activeListId)!;
  const activeList = lists.find((l) => l.id === activeListId)!;

  const [recipeRows, shareData] = await Promise.all([
    prisma.recipe.findMany({
      where: {
        status: "estructurado",
        lists: { some: { listId: activeListId } },
        ...(query
          ? {
              OR: [
                { title: { contains: query } },
                { rawText: { contains: query } },
                { extraNotes: { contains: query } },
                { ingredientIndex: { contains: query } },
                { tagsJson: { contains: query } },
                { cuisineJson: { contains: query } },
              ],
            }
          : {}),
      },
      orderBy: [{ title: "asc" }],
      include: {
        lists: { select: { listId: true } },
      },
    }),
    activeAccess.isOwner
      ? prisma.recipeList.findUnique({
          where: { id: activeListId },
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, image: true },
                },
              },
              orderBy: { createdAt: "asc" },
            },
            invites: {
              where: { revokedAt: null },
              orderBy: { createdAt: "desc" },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  const recipes = recipeRows
    .filter((recipe) => {
      if (!recipe.ingredientsJson || !recipe.stepsJson) return false;
      try {
        const ingredients = JSON.parse(recipe.ingredientsJson);
        const steps = JSON.parse(recipe.stepsJson);
        return (
          Array.isArray(ingredients) &&
          ingredients.length > 0 &&
          Array.isArray(steps) &&
          steps.length > 0
        );
      } catch {
        return false;
      }
    })
    .map((recipe) => {
      const tags = parseStringArray(recipe.tagsJson);
      const cuisines = parseStringArray(recipe.cuisineJson);
      const seen = new Set<string>();
      const hashtags: string[] = [];
      for (const value of [...cuisines, ...tags]) {
        const tag = value.trim().replace(/^#+/, "").toLowerCase();
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        hashtags.push(tag);
      }
      return {
        id: recipe.id,
        slug: recipe.slug,
        title: recipe.title,
        preview: recipe.rawText,
        listIds: recipe.lists.map((item) => item.listId),
        hashtags,
      };
    });

  return (
    <LibraryClient
      lists={lists.map((list) => {
        const a = access.get(list.id)!;
        return {
          id: list.id,
          name: list.name,
          isDefault: list.isDefault,
          isOwner: a.isOwner,
          canEdit: a.canEdit,
          recipeCount: list._count.recipes,
        };
      })}
      activeListId={activeListId}
      activeListName={activeList.name}
      query={query}
      recipes={recipes}
      userImage={session?.user?.image}
      userLabel={session?.user?.name ?? session?.user?.email ?? "?"}
      signOutAction={signOutToLogin}
      isOwner={activeAccess.isOwner}
      members={
        shareData?.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          canEdit: m.canEdit,
          user: m.user,
        })) ?? []
      }
      invites={shareData?.invites ?? []}
    />
  );
}
