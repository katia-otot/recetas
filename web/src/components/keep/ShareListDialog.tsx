"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ShareListPanel } from "@/components/ShareListPanel";
import { IconClose, IconPersonAdd } from "./icons";

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

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function ShareListDialog({
  open,
  onClose,
  listId,
  listName,
  members,
  invites,
}: {
  open: boolean;
  onClose: () => void;
  listId: string;
  listName: string;
  members: Member[];
  invites: Invite[];
}) {
  const isClient = useIsClient();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !isClient) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-stone-900/40"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-list-title"
        className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
          <IconPersonAdd className="h-5 w-5 text-stone-700" />
          <div className="min-w-0 flex-1">
            <h2
              id="share-list-title"
              className="truncate text-base font-medium text-stone-900"
            >
              Colaboradores
            </h2>
            <p className="truncate text-xs text-stone-500">{listName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-stone-100"
            aria-label="Cerrar"
          >
            <IconClose />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <ShareListPanel
            listId={listId}
            members={members}
            invites={invites}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
