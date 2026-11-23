import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function findActiveShareByToken(token: string) {
  return prisma.recipeShareLink.findFirst({
    where: { token, revokedAt: null },
    include: {
      recipe: {
        include: {
          sources: { orderBy: { isPrimary: "desc" } },
        },
      },
    },
  });
}

/** Reusa el link activo de la receta o crea uno nuevo. */
export async function getOrCreateRecipeShareLink(
  recipeId: string,
  userId: string,
) {
  const existing = await prisma.recipeShareLink.findFirst({
    where: { recipeId, revokedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return prisma.recipeShareLink.create({
    data: {
      recipeId,
      createdById: userId,
      token: newShareToken(),
    },
  });
}
