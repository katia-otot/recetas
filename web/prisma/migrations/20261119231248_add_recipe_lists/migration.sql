-- CreateTable
CREATE TABLE "RecipeList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecipeList_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecipeListMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecipeListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "RecipeList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeListMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecipeListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecipeListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "RecipeList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeListItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecipeListInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecipeListInvite_listId_fkey" FOREIGN KEY ("listId") REFERENCES "RecipeList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeListInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RecipeList_ownerId_idx" ON "RecipeList"("ownerId");

-- CreateIndex
CREATE INDEX "RecipeListMember_userId_idx" ON "RecipeListMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeListMember_listId_userId_key" ON "RecipeListMember"("listId", "userId");

-- CreateIndex
CREATE INDEX "RecipeListItem_recipeId_idx" ON "RecipeListItem"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeListItem_listId_recipeId_key" ON "RecipeListItem"("listId", "recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeListInvite_token_key" ON "RecipeListInvite"("token");

-- CreateIndex
CREATE INDEX "RecipeListInvite_listId_idx" ON "RecipeListInvite"("listId");
