"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import type { RecipeVoteSummary, RecipeVoteValue } from "@/lib/recipe-votes";

function applyVote(
  current: RecipeVoteSummary,
  value: RecipeVoteValue,
): RecipeVoteSummary {
  const likes = current.likes - (current.mine === "like" ? 1 : 0);
  const dislikes = current.dislikes - (current.mine === "dislike" ? 1 : 0);
  if (current.mine === value) {
    return { mine: null, likes, dislikes };
  }
  return {
    mine: value,
    likes: likes + (value === "like" ? 1 : 0),
    dislikes: dislikes + (value === "dislike" ? 1 : 0),
  };
}

export function RecipeVoteButtons({
  slug,
  initial,
  compact = false,
}: {
  slug: string;
  initial: RecipeVoteSummary;
  compact?: boolean;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(initial);
  const [trackedSlug, setTrackedSlug] = useState(slug);
  const [pending, setPending] = useState(false);

  if (slug !== trackedSlug) {
    setTrackedSlug(slug);
    setSummary(initial);
  }

  async function vote(value: RecipeVoteValue) {
    if (pending) return;
    const previous = summary;
    setSummary(applyVote(previous, value));
    setPending(true);
    try {
      const res = await fetch(withBasePath(`/api/recetas/${slug}/voto`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo votar");
      setSummary({
        mine: data.mine === "like" || data.mine === "dislike" ? data.mine : null,
        likes: typeof data.likes === "number" ? data.likes : 0,
        dislikes: typeof data.dislikes === "number" ? data.dislikes : 0,
      });
      router.refresh();
    } catch {
      setSummary(previous);
    } finally {
      setPending(false);
    }
  }

  const size = compact
    ? "h-11 min-w-11 text-lg"
    : "h-11 min-w-11 text-xl";

  return (
    <div
      className="inline-flex items-center gap-1.5"
      role="group"
      aria-label="Voto"
    >
      <VoteButton
        emoji="👍"
        label="Me gustó"
        count={summary.likes}
        pressed={summary.mine === "like"}
        pending={pending}
        size={size}
        activeClass="border border-amber-300 bg-amber-100"
        onClick={() => vote("like")}
      />
      <VoteButton
        emoji="👎"
        label="No me gustó"
        count={summary.dislikes}
        pressed={summary.mine === "dislike"}
        pending={pending}
        size={size}
        activeClass="border border-stone-400 bg-stone-200"
        onClick={() => vote("dislike")}
      />
    </div>
  );
}

function VoteButton({
  emoji,
  label,
  count,
  pressed,
  pending,
  size,
  activeClass,
  onClick,
}: {
  emoji: string;
  label: string;
  count: number;
  pressed: boolean;
  pending: boolean;
  size: string;
  activeClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      disabled={pending}
      aria-label={count > 0 ? `${label}, ${count}` : label}
      aria-pressed={pressed}
      title={label}
      className={`inline-flex items-center justify-center gap-1 rounded-full px-2.5 leading-none transition-colors hover:bg-stone-100 disabled:opacity-60 ${size} ${
        pressed ? activeClass : "border border-stone-200 bg-white"
      }`}
    >
      <span aria-hidden>{emoji}</span>
      {count > 0 && (
        <span className="text-xs font-medium tabular-nums text-stone-600">
          {count}
        </span>
      )}
    </button>
  );
}
