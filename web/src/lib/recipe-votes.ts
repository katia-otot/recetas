export type RecipeVoteValue = "like" | "dislike";

export type RecipeVoteSummary = {
  mine: RecipeVoteValue | null;
  likes: number;
  dislikes: number;
};

export function isRecipeVoteValue(value: unknown): value is RecipeVoteValue {
  return value === "like" || value === "dislike";
}

/** Orden de la lista: me gusta, sin voto, no me gusta. */
export function recipeVoteListRank(mine: RecipeVoteValue | null): number {
  if (mine === "like") return 0;
  if (mine === "dislike") return 2;
  return 1;
}

export function summarizeRecipeVotes(
  votes: { userId: string; value: string }[],
  userId: string,
): RecipeVoteSummary {
  let likes = 0;
  let dislikes = 0;
  let mine: RecipeVoteValue | null = null;

  for (const vote of votes) {
    if (!isRecipeVoteValue(vote.value)) continue;
    if (vote.value === "like") likes += 1;
    else dislikes += 1;
    if (vote.userId === userId) mine = vote.value;
  }

  return { mine, likes, dislikes };
}
