import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AddRecipePanel } from "@/components/AddRecipePanel";
import { KeepShell } from "@/components/keep/KeepShell";
import { signOutToLogin } from "@/lib/auth-actions";
import { loadKeepNav } from "@/lib/keep-nav";
import { requireUser } from "@/lib/session-user";

type PageProps = {
  searchParams: Promise<{ modo?: string; lista?: string }>;
};

export default async function AgregarPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const session = await auth();
  const { modo, lista } = await searchParams;
  const { lists, personalId } = await loadKeepNav(user.id);

  const activeListId =
    lista && lists.some((l) => l.id === lista) ? lista : personalId;
  const canEdit = lists.find((l) => l.id === activeListId)?.canEdit ?? false;
  const initialMode = modo === "manual" ? "manual" : "link";

  return (
    <KeepShell
      lists={lists}
      activeListId={activeListId}
      userImage={session?.user?.image}
      userLabel={session?.user?.name ?? session?.user?.email ?? "?"}
      signOutAction={signOutToLogin}
      headerTitle="Agregar receta"
      hideSearch
      showMobileTitle={false}
      backHref={`/?lista=${activeListId}`}
    >
      <div className="mx-auto w-full max-w-2xl min-w-0">
        <h1 className="text-xl font-semibold text-stone-900 sm:text-2xl">
          Agregar receta
        </h1>
        {!canEdit ? (
          <p className="mt-4 text-sm text-stone-600">
            Esta lista es de solo lectura. Cambiá a una lista donde puedas
            editar para agregar.
          </p>
        ) : (
          <div className="mt-4">
            <AddRecipePanel
              initialMode={initialMode}
              listId={activeListId}
            />
          </div>
        )}
      </div>
    </KeepShell>
  );
}
