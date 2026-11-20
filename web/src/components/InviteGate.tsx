"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AcceptInviteButton } from "@/components/AcceptInviteButton";
import { withBasePath } from "@/lib/base-path";

export function InviteGate({
  token,
  listName,
  canEdit,
  email,
  isLoggedIn,
}: {
  token: string;
  listName: string;
  canEdit: boolean;
  email: string | null;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(withBasePath(`/api/invitar/${token}`));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Invitación inválida");
        if (cancelled) return;

        if (!isLoggedIn) {
          const callback = encodeURIComponent(`/invitar/${token}`);
          router.replace(`/login?callbackUrl=${callback}`);
          return;
        }
        setReady(true);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isLoggedIn, router]);

  if (error) {
    return (
      <p className="text-sm text-red-700" role="alert">
        {error}
      </p>
    );
  }

  if (!isLoggedIn || !ready) {
    return (
      <p className="text-sm text-stone-600">
        Preparando invitación…
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-stone-600">
        Te invitaron a <span className="font-medium text-stone-800">{listName}</span>.
        {canEdit
          ? " Vas a poder ver y editar."
          : " Vas a poder verlas (sin editar)."}
      </p>
      {email && (
        <p className="mt-2 text-sm text-stone-500">Pensada para: {email}</p>
      )}
      <div className="mt-6">
        <AcceptInviteButton token={token} />
      </div>
    </div>
  );
}
