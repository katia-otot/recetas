"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { RecipeDetailHeaderActions } from "@/components/RecipeDetailHeaderActions";
import { withBasePath } from "@/lib/base-path";
import type { KeepListNavItem } from "@/lib/keep-nav";
import {
  IconBack,
  IconClose,
  IconLabel,
  IconMenu,
  IconPersonAdd,
  IconPlus,
  IconSearch,
} from "./icons";

export type { KeepListNavItem };

function RecetasLogo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={withBasePath("/icon-512.png")}
      alt=""
      width={28}
      height={28}
      className={className}
    />
  );
}

type KeepShellProps = {
  lists: KeepListNavItem[];
  activeListId: string;
  query?: string;
  userImage?: string | null;
  userLabel?: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
  onOpenShare?: () => void;
  showShare?: boolean;
  /** Título junto al logo (desktop). Por defecto: nombre de la lista activa. */
  headerTitle?: string;
  /** Fila de título debajo del search en mobile. Default true. */
  showMobileTitle?: boolean;
  /** En detalle de receta: sin buscador, título = receta, compartir link. */
  hideSearch?: boolean;
  /** Link de la flecha ← (detalle de receta). */
  backHref?: string | null;
  /** Acciones del detalle: Editar / Borrar / Compartir (una sola vez). */
  recipeDetail?: {
    slug: string;
    title: string;
    canEdit: boolean;
    canDelete: boolean;
  } | null;
};

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function KeepShell({
  lists,
  activeListId,
  query = "",
  userImage,
  userLabel = "?",
  signOutAction,
  children,
  onOpenShare,
  showShare = false,
  headerTitle,
  showMobileTitle = true,
  hideSearch = false,
  backHref = null,
  recipeDetail = null,
}: KeepShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const router = useRouter();
  const isClient = useIsClient();
  const activeList = lists.find((l) => l.id === activeListId);
  const displayTitle = headerTitle ?? activeList?.name ?? "Recetas";

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(withBasePath("/api/listas"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear");
      setNewName("");
      setDrawerOpen(false);
      router.push(`/?lista=${data.list.id}`);
      router.refresh();
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function listHref(listId: string) {
    return query
      ? `/?lista=${listId}&q=${encodeURIComponent(query)}`
      : `/?lista=${listId}`;
  }

  const drawer = (
    <aside className="flex h-full w-[min(100vw-3rem,18rem)] flex-col bg-[#fefefe] text-stone-800 shadow-xl">
      <div className="flex items-center gap-3 px-4 py-4">
        <RecetasLogo className="h-7 w-7" />
        <span className="text-xl font-medium tracking-tight text-stone-800">
          Recetas
        </span>
        <button
          type="button"
          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-label="Cerrar menú"
        >
          <IconClose />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <p className="px-3 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-stone-500">
          Listas
        </p>
        <ul className="space-y-0.5">
          {lists.map((list) => {
            const active = list.id === activeListId;
            return (
              <li key={list.id}>
                <Link
                  href={listHref(list.id)}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-3 rounded-full px-3 py-2.5 text-sm ${
                    active
                      ? "bg-amber-100 font-medium text-amber-950"
                      : "text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  <IconLabel className="h-5 w-5 shrink-0 opacity-80" />
                  <span className="min-w-0 flex-1 truncate">{list.name}</span>
                  <span className="text-xs text-stone-500">
                    {list.recipeCount || ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <form onSubmit={createList} className="mt-4 space-y-2 px-2">
          <label className="sr-only" htmlFor="new-list-name">
            Nueva lista
          </label>
          <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2 py-1">
            <IconPlus className="ml-1 h-4 w-4 text-stone-500" />
            <input
              id="new-list-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Crear lista nueva"
              maxLength={80}
              className="min-h-9 w-full border-0 bg-transparent px-1 text-sm text-stone-900 outline-none placeholder:text-stone-400"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="inline-flex min-h-9 w-full items-center justify-center rounded-full bg-stone-900 px-3 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
          >
            {creating ? "Creando…" : "Crear lista"}
          </button>
          {createError && (
            <p className="px-1 text-xs text-red-700">{createError}</p>
          )}
        </form>

      </nav>
    </aside>
  );

  const mobileDrawer =
    isClient && drawerOpen
      ? createPortal(
          <div className="fixed inset-0 z-[80] md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-stone-900/40"
              aria-label="Cerrar menú"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 pt-[env(safe-area-inset-top)]">
              {drawer}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex min-h-full flex-1 bg-[#f8f9fa]">
      <div className="sticky top-0 hidden h-dvh shrink-0 border-r border-stone-200 md:block">
        {drawer}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#f8f9fa]/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="flex h-14 items-center gap-1 px-2 sm:gap-2 sm:px-4">
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-200/70"
                aria-label="Volver"
              >
                <IconBack />
              </Link>
            ) : (
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-stone-700 hover:bg-stone-200/70 md:hidden"
                onClick={() => setDrawerOpen(true)}
                aria-label="Abrir menú de listas"
              >
                <IconMenu />
              </button>
            )}

            {hideSearch ? (
              <h1 className="min-w-0 flex-1 truncate px-1 text-base font-medium leading-none text-stone-900 sm:text-lg">
                {displayTitle}
              </h1>
            ) : (
              <>
                <div className="hidden items-center gap-2 md:flex">
                  <RecetasLogo className="h-7 w-7" />
                  <span className="text-lg font-medium leading-none text-stone-800">
                    {displayTitle}
                  </span>
                </div>

                <form
                  action={withBasePath("/")}
                  method="get"
                  className="mx-1 flex h-10 min-w-0 flex-1 items-center rounded-full bg-white px-3 shadow-sm ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-amber-200 sm:mx-3"
                >
                  <input type="hidden" name="lista" value={activeListId} />
                  <IconSearch className="mr-2 h-5 w-5 shrink-0 text-stone-400" />
                  <input
                    name="q"
                    type="search"
                    enterKeyHint="search"
                    defaultValue={query}
                    placeholder="Buscá lo que quieras"
                    className="h-10 w-full border-0 bg-transparent text-stone-900 outline-none placeholder:text-stone-400"
                    aria-label="Buscar recetas"
                  />
                </form>
              </>
            )}

            {recipeDetail && (
              <RecipeDetailHeaderActions
                slug={recipeDetail.slug}
                title={recipeDetail.title}
                canEdit={recipeDetail.canEdit}
                canDelete={recipeDetail.canDelete}
              />
            )}

            {showShare && onOpenShare && (
              <button
                type="button"
                onClick={onOpenShare}
                className="inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-stone-700 hover:bg-stone-200/70 sm:px-3"
                title="Compartir esta lista con otras personas"
                aria-label="Compartir esta lista con otras personas"
              >
                <IconPersonAdd />
                <span className="hidden text-sm sm:inline">Compartir</span>
              </button>
            )}

            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userImage}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full border border-stone-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-semibold text-amber-950">
                {userLabel.slice(0, 1).toUpperCase()}
              </span>
            )}

            <form action={signOutAction} className="hidden sm:block">
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-full px-3 text-sm text-stone-600 hover:bg-stone-200/70"
              >
                Salir
              </button>
            </form>
          </div>

          {showMobileTitle && !hideSearch && (
            <div className="flex items-center justify-between px-4 pb-3 md:hidden">
              <p className="text-xl font-medium text-stone-900">
                {displayTitle}
              </p>
            </div>
          )}
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 pb-24 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>

      {mobileDrawer}
    </div>
  );
}
