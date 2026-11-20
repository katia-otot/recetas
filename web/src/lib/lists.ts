import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

export const INVITE_COOKIE = "recetas_invite";
export const INVITE_COOKIE_MAX_AGE = 60 * 60 * 24; // 24h

export type ListAccess = {
  listId: string;
  isOwner: boolean;
  canEdit: boolean;
  canView: boolean;
};

export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function ensurePersonalList(userId: string) {
  const existing = await prisma.recipeList.findFirst({
    where: { ownerId: userId, isDefault: true },
  });
  if (existing) return existing;

  return prisma.recipeList.create({
    data: {
      name: "Personal",
      isDefault: true,
      ownerId: userId,
    },
  });
}

function allowedEmails(): string[] {
  return (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Crea Personal si falta, mete ahí las recetas del usuario sin lista,
 * y (solo dueña de la app / allowlist) reclama recetas sin dueño.
 */
export async function claimOrphanRecipes(userId: string) {
  const personal = await ensurePersonalList(userId);

  const ownOrphans = await prisma.recipe.findMany({
    where: { createdById: userId, lists: { none: {} } },
    select: { id: true, createdById: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const allow = allowedEmails();
  const canClaimUnowned =
    allow.length === 0 ||
    (!!user?.email && allow.includes(user.email.toLowerCase()));

  const unowned = canClaimUnowned
    ? await prisma.recipe.findMany({
        where: { createdById: null, lists: { none: {} } },
        select: { id: true, createdById: true },
      })
    : [];

  const orphans = [...ownOrphans, ...unowned];
  if (orphans.length === 0) return personal;

  await prisma.$transaction(async (tx) => {
    for (const recipe of orphans) {
      if (!recipe.createdById) {
        await tx.recipe.update({
          where: { id: recipe.id },
          data: { createdById: userId },
        });
      }
      await tx.recipeListItem.create({
        data: { listId: personal.id, recipeId: recipe.id },
      });
    }
  });

  return personal;
}

export async function getUserListAccess(
  userId: string,
): Promise<Map<string, ListAccess>> {
  const [owned, memberships] = await Promise.all([
    prisma.recipeList.findMany({
      where: { ownerId: userId },
      select: { id: true },
    }),
    prisma.recipeListMember.findMany({
      where: { userId },
      select: { listId: true, canEdit: true },
    }),
  ]);

  const map = new Map<string, ListAccess>();
  for (const list of owned) {
    map.set(list.id, {
      listId: list.id,
      isOwner: true,
      canEdit: true,
      canView: true,
    });
  }
  for (const membership of memberships) {
    const prev = map.get(membership.listId);
    if (prev?.isOwner) continue;
    map.set(membership.listId, {
      listId: membership.listId,
      isOwner: false,
      canEdit: membership.canEdit,
      canView: true,
    });
  }
  return map;
}

export async function listIdsForUser(userId: string): Promise<string[]> {
  const access = await getUserListAccess(userId);
  return [...access.keys()];
}

export async function getListAccessForUser(
  userId: string,
  listId: string,
): Promise<ListAccess | null> {
  const list = await prisma.recipeList.findUnique({
    where: { id: listId },
    select: { id: true, ownerId: true },
  });
  if (!list) return null;
  if (list.ownerId === userId) {
    return { listId, isOwner: true, canEdit: true, canView: true };
  }
  const membership = await prisma.recipeListMember.findUnique({
    where: { listId_userId: { listId, userId } },
  });
  if (!membership) return null;
  return {
    listId,
    isOwner: false,
    canEdit: membership.canEdit,
    canView: true,
  };
}

export async function canViewRecipe(
  userId: string,
  recipeId: string,
): Promise<boolean> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: {
      createdById: true,
      lists: { select: { listId: true } },
    },
  });
  if (!recipe) return false;
  if (recipe.createdById === userId) return true;
  if (recipe.lists.length === 0) return false;

  const access = await getUserListAccess(userId);
  return recipe.lists.some((item) => access.has(item.listId));
}

export async function canEditRecipe(
  userId: string,
  recipeId: string,
): Promise<boolean> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: {
      createdById: true,
      lists: { select: { listId: true } },
    },
  });
  if (!recipe) return false;
  if (recipe.createdById === userId) return true;

  const access = await getUserListAccess(userId);
  return recipe.lists.some((item) => access.get(item.listId)?.canEdit);
}

export async function canDeleteRecipe(
  userId: string,
  recipeId: string,
): Promise<boolean> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { createdById: true },
  });
  if (!recipe) return false;
  if (recipe.createdById === userId) return true;

  // Dueño de alguna lista que contiene la receta también puede borrar
  const items = await prisma.recipeListItem.findMany({
    where: { recipeId },
    select: { list: { select: { ownerId: true } } },
  });
  return items.some((item) => item.list.ownerId === userId);
}

export function isInviteActive(invite: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}): boolean {
  if (invite.revokedAt) return false;
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return false;
  return true;
}

export async function findActiveInviteByToken(token: string) {
  const invite = await prisma.recipeListInvite.findUnique({
    where: { token },
    include: {
      list: { select: { id: true, name: true, ownerId: true } },
    },
  });
  if (!invite || !isInviteActive(invite)) return null;
  return invite;
}

export async function acceptInvite(token: string, user: { id: string; email?: string | null }) {
  const invite = await findActiveInviteByToken(token);
  if (!invite) {
    throw new Error("La invitación no es válida o expiró");
  }

  if (invite.email) {
    const email = user.email?.toLowerCase();
    if (!email || email !== invite.email.toLowerCase()) {
      throw new Error("Esta invitación es para otro email");
    }
  }

  if (invite.list.ownerId === user.id) {
    return { listId: invite.list.id, alreadyMember: true as const };
  }

  await prisma.recipeListMember.upsert({
    where: {
      listId_userId: { listId: invite.listId, userId: user.id },
    },
    create: {
      listId: invite.listId,
      userId: user.id,
      canEdit: invite.canEdit,
    },
    update: {
      canEdit: invite.canEdit,
    },
  });

  return { listId: invite.list.id, alreadyMember: false as const };
}

export async function userHasValidInviteCookie(
  token: string | undefined,
  email: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;
  const invite = await findActiveInviteByToken(token);
  if (!invite) return false;
  if (!invite.email) return true;
  return !!email && email.toLowerCase() === invite.email.toLowerCase();
}
