import { auth } from "@/auth";
import { signInWithGoogle } from "@/lib/auth-actions";
import { redirect } from "next/navigation";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, callbackUrl } = await searchParams;
  const session = await auth();
  if (session?.user) {
    redirect(callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/");
  }
  const errorMessage =
    error === "AccessDenied"
      ? "Tu cuenta de Google no está autorizada para esta app."
      : error
        ? "No se pudo iniciar sesión. Probá de nuevo."
        : null;

  const loginAction = signInWithGoogle.bind(null, callbackUrl || "/");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-stone-200 bg-white px-6 py-8 shadow-sm sm:px-8">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-amber-800">
          Recetas
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
          Entrar a tu biblioteca
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Tenés que iniciar sesión con Google para ver e importar recetas.
        </p>

        {errorMessage && (
          <p
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        <form className="mt-6" action={loginAction}>
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 shadow-sm transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-200"
          >
            <GoogleMark />
            Continuar con Google
          </button>
        </form>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.7 0 2.9.7 3.6 1.3l2.4-2.4C16.7 3.8 14.6 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12S6.9 21.2 12 21.2c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1-.2-1.5H12z"
      />
      <path
        fill="#34A853"
        d="M3.9 7.4 6.9 9.6C7.7 7.6 9.7 6.2 12 6.2c1.7 0 2.9.7 3.6 1.3l2.4-2.4C16.7 3.8 14.6 2.8 12 2.8 8.3 2.8 5.1 4.9 3.9 7.4z"
      />
      <path
        fill="#4A90E2"
        d="M12 21.2c2.5 0 4.6-.8 6.1-2.2l-2.9-2.3c-.8.6-1.9 1-3.2 1-2.5 0-4.6-1.7-5.3-3.9l-3 2.3c1.3 2.6 4 4.1 8.3 4.1z"
      />
      <path
        fill="#FBBC05"
        d="M6.7 13.8c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8L3.7 7.9C3.1 9.1 2.8 10.5 2.8 12s.3 2.9.9 4.1l3-2.3z"
      />
    </svg>
  );
}
