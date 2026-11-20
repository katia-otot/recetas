"use client";

import { useState } from "react";
import { KeepShell, type KeepListNavItem } from "./KeepShell";
import { RecipeBoard, type BoardRecipe } from "./RecipeBoard";
import { ShareListDialog } from "./ShareListDialog";

type Member = {
  id: string;
  userId: string;
  canEdit: boolean;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

type Invite = {
  id: string;
  token: string;
  email: string | null;
  canEdit: boolean;
  expiresAt: string | Date | null;
  createdAt: string | Date;
};

export function LibraryClient({
  lists,
  activeListId,
  query,
  recipes,
  userImage,
  userLabel,
  signOutAction,
  isOwner,
  members,
  invites,
  activeListName,
}: {
  lists: KeepListNavItem[];
  activeListId: string;
  query: string;
  recipes: BoardRecipe[];
  userImage?: string | null;
  userLabel?: string;
  signOutAction: () => Promise<void>;
  isOwner: boolean;
  members: Member[];
  invites: Invite[];
  activeListName: string;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const active = lists.find((l) => l.id === activeListId);

  return (
    <>
      <KeepShell
        lists={lists}
        activeListId={activeListId}
        query={query}
        userImage={userImage}
        userLabel={userLabel}
        signOutAction={signOutAction}
        showShare={isOwner}
        onOpenShare={() => setShareOpen(true)}
      >
        <RecipeBoard
          recipes={recipes}
          lists={lists.map((l) => ({
            id: l.id,
            name: l.name,
            canEdit: l.canEdit,
          }))}
          activeListId={activeListId}
          canEditActive={active?.canEdit ?? false}
        />
      </KeepShell>

      {isOwner && (
        <ShareListDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          listId={activeListId}
          listName={activeListName}
          members={members}
          invites={invites}
        />
      )}
    </>
  );
}
