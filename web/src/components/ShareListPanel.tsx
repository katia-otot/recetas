"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { withBasePath } from "@/lib/base-path";

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

export function ShareListPanel({
  listId,
  members,
  invites: initialInvites,
}: {
  listId: string;
  members: Member[];
  invites: Invite[];
}) {
  const router = useRouter();
  const [canEdit, setCanEdit] = useState(true);
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState(initialInvites);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const origin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  function inviteUrl(token: string) {
    return `${origin}${withBasePath(`/invitar/${token}`)}`;
  }

  async function createInvite() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(withBasePath(`/api/listas/${listId}/invites`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canEdit,
          email: email.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el link");
      setInvites((prev) => [data.invite, ...prev]);
      setEmail("");
      setMessage("Link creado. Copialo y mandáselo.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(invite: Invite) {
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.token));
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("No se pudo copiar. Seleccioná el link a mano.");
    }
  }

  async function revokeInvite(inviteId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        withBasePath(`/api/listas/${listId}/invites/${inviteId}`),
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo revocar");
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setMemberCanEdit(userId: string, next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        withBasePath(`/api/listas/${listId}/miembros/${userId}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canEdit: next }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("¿Sacar a esta persona de la lista?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        withBasePath(`/api/listas/${listId}/miembros/${userId}`),
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo sacar");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-1">
      <p className="text-sm text-stone-600">
        Generá un link de invitación. Quien lo abra entra con Google y se suma a
        esta lista (como colaboradores en Keep).
      </p>

      <div className="mt-4 space-y-3">
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={canEdit}
            onChange={(e) => setCanEdit(e.target.checked)}
            className="size-4 rounded border-stone-300 text-amber-600 focus:ring-amber-200"
          />
          Puede editar recetas
        </label>
        <div>
          <label
            htmlFor="invite-email"
            className="block text-sm font-medium text-stone-700"
          >
            Email (opcional)
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="si lo dejás vacío, cualquiera con el link"
            className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-stone-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>
        <button
          type="button"
          onClick={createInvite}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          Crear link de invitación
        </button>
      </div>

      {message && (
        <p className="mt-3 text-sm text-emerald-800">{message}</p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {invites.length > 0 && (
        <ul className="mt-5 space-y-3 border-t border-stone-100 pt-4">
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="rounded-xl border border-stone-200 bg-stone-50 p-3"
            >
              <p className="text-sm text-stone-800">
                {invite.canEdit ? "Puede editar" : "Solo ver"}
                {invite.email ? ` · ${invite.email}` : " · link abierto"}
              </p>
              <p className="mt-1 break-all text-xs text-stone-500">
                {inviteUrl(invite.token)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copyLink(invite)}
                  className="inline-flex min-h-9 items-center rounded-lg border border-stone-300 bg-white px-3 text-xs text-stone-700 hover:bg-stone-50"
                >
                  {copiedId === invite.id ? "Copiado" : "Copiar link"}
                </button>
                <button
                  type="button"
                  onClick={() => revokeInvite(invite.id)}
                  disabled={busy}
                  className="inline-flex min-h-9 items-center rounded-lg border border-red-200 bg-red-50 px-3 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Revocar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {members.length > 0 && (
        <div className="mt-6 border-t border-stone-100 pt-4">
          <h3 className="text-sm font-semibold text-stone-800">Personas</h3>
          <ul className="mt-3 space-y-3">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-stone-900">
                    {member.user.name ?? member.user.email ?? "Usuario"}
                  </p>
                  {member.user.email && (
                    <p className="text-xs text-stone-500">{member.user.email}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-stone-700">
                    <input
                      type="checkbox"
                      checked={member.canEdit}
                      disabled={busy}
                      onChange={(e) =>
                        setMemberCanEdit(member.userId, e.target.checked)
                      }
                      className="size-4 rounded border-stone-300 text-amber-600 focus:ring-amber-200"
                    />
                    Puede editar
                  </label>
                  <button
                    type="button"
                    onClick={() => removeMember(member.userId)}
                    disabled={busy}
                    className="inline-flex min-h-9 items-center rounded-lg border border-stone-300 bg-white px-3 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                  >
                    Sacar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
