import Link from "next/link";

export function SiteHeader() {
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
        </nav>
      </div>
    </header>
  );
}
