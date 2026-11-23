import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion: number | undefined;
};

/** Subí este número cuando agregues modelos al schema y el HMR deje un client viejo. */
const PRISMA_SCHEMA_VERSION = 4;

function defaultDatabaseUrl(): string {
  // Local dev and scripts run from web/; production sets DATABASE_URL explicitly.
  const dbPath = path.resolve(process.cwd(), "..", "data", "recetas.db");
  return `file:${dbPath}`;
}

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? defaultDatabaseUrl(),
  });
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  const versionOk = globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION;
  const hasLists =
    cached != null &&
    typeof (
      cached as { recipeList?: { findFirst?: unknown } }
    ).recipeList?.findFirst === "function";

  if (cached && versionOk && hasLists) {
    return cached;
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
  }
  return client;
}

export const prisma = getPrismaClient();
