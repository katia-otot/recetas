import Link from "next/link";
import { auth } from "@/auth";
import { signOutToLogin } from "@/lib/auth-actions";

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-lg font-semibold tracking-tight text-stone-900"
        >
          Recetas
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          >
            Biblioteca
          </Link>
          <Link
            href="/importar-link"
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          >
            <span className="sm:hidden">Importar</span>
            <span className="hidden sm:inline">Importar link</span>
          </Link>
          {user && (
            <div className="ml-1 flex items-center gap-2 border-l border-stone-200 pl-2 sm:pl-3">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  className="h-8 w-8 rounded-full border border-stone-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700">
                  {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              <form action={signOutToLogin}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-lg px-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 sm:px-3"
                >
                  Salir
                </button>
              </form>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
