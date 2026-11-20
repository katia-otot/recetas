import Link from "next/link";
import { auth } from "@/auth";
import { InviteGate } from "@/components/InviteGate";
import { findActiveInviteByToken } from "@/lib/lists";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  const invite = await findActiveInviteByToken(token);
  const session = await auth();

  if (!invite) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="rounded-2xl border border-stone-200 bg-white px-6 py-8 shadow-sm">
          <h1 className="text-xl font-semibold text-stone-900">
            Invitación no válida
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            El link expiró, fue revocado o no existe.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-11 items-center text-amber-800 hover:underline"
          >
            Ir a la biblioteca
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-stone-200 bg-white px-6 py-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-amber-800">
          Invitación
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
          {invite.list.name}
        </h1>
        <div className="mt-4">
          <InviteGate
            token={token}
            listName={invite.list.name}
            canEdit={invite.canEdit}
            email={invite.email}
            isLoggedIn={!!session?.user}
          />
        </div>
      </div>
    </main>
  );
}
