/**
 * Auditoría semántica de CFEs guardados.
 * Uso: npx tsx scripts/ai/audit-cfe-now.ts
 */
import "../../src/lib/load-env";
import { prisma } from "../../src/lib/db";
import {
  cfeNeedsAiRepair,
  diagnoseCfeIssues,
  layoutActionGraph,
  refineStoredCfe,
} from "../../src/lib/cfe";
import type { CfeData } from "../../src/lib/recipe-schema";

type ExtraIssue = { code: string; detail: string };

/** Heurísticas aún no metidas en diagnoseCfeIssues. */
function extraHeuristics(cfe: CfeData): ExtraIssue[] {
  const issues: ExtraIssue[] = [];
  const actions = layoutActionGraph(cfe.actions ?? []);

  // Mezclar/rebozar coat DESPUÉS de Dorar el mismo ítem (orden invertido).
  // Ignorar "Mezclar y servir" / joins finales de plato.
  for (let i = 0; i < actions.length; i++) {
    for (let j = 0; j < actions.length; j++) {
      if (i === j) continue;
      const cook = actions[i];
      const mix = actions[j];
      if (!/dorar|fre[ií]r/i.test(cook.verb)) continue;
      if (!/mezclar|rebozar|enharinar|marinar/i.test(mix.verb)) continue;
      if (/servir|ali[ñn]ar|incorporar|armar|montar/i.test(mix.verb)) continue;
      if ((cook.column ?? 1) >= (mix.column ?? 1)) continue;
      // Coat típico: poco ids y overlap con el cook; no un join enorme
      if (mix.ingredientIds.length > cook.ingredientIds.length + 3) continue;
      if (!cook.ingredientIds.some((id) => mix.ingredientIds.includes(id))) {
        continue;
      }
      issues.push({
        code: "cook_left_of_mix",
        detail: `col${cook.column} ${cook.verb} antes de col${mix.column} ${mix.verb}`,
      });
    }
  }

  // Agregar/añadir sin overlap con su dependsOn (no acumuló)
  actions.forEach((a, idx) => {
    if (!/agregar|a[ñn]adir/i.test(a.verb)) return;
    for (const d of a.dependsOn ?? []) {
      const prev = actions[d - 1];
      if (!prev) continue;
      const missing = prev.ingredientIds.filter(
        (id) => !a.ingredientIds.includes(id),
      );
      if (missing.length > 0 && prev.ingredientIds.length <= 4) {
        issues.push({
          code: "wok_not_accumulated",
          detail: `${a.verb} (#${idx + 1}) no trae ${missing.join(",")}`,
        });
      }
    }
  });

  return issues;
}

async function main() {
  const recipes = await prisma.recipe.findMany({
    where: { status: "estructurado", cfeJson: { not: null } },
    select: {
      title: true,
      slug: true,
      cfeJson: true,
      stepsJson: true,
    },
    orderBy: { title: "asc" },
  });

  const tally: Record<string, number> = {};
  const bySlug: Array<{
    slug: string;
    title: string;
    issues: string[];
    serious: boolean;
  }> = [];

  let clean = 0;
  for (const r of recipes) {
    const raw = JSON.parse(r.cfeJson || "null") as CfeData | null;
    if (!raw) continue;
    const steps = JSON.parse(r.stepsJson || "[]") as string[];
    const cfe = refineStoredCfe(raw, { steps }) ?? raw;
    const diag = diagnoseCfeIssues(cfe, { steps });
    const extra = extraHeuristics(cfe);
    const all = [...diag, ...extra];
    if (all.length === 0) {
      clean += 1;
      continue;
    }
    for (const i of all) {
      tally[i.code] = (tally[i.code] ?? 0) + 1;
    }
    bySlug.push({
      slug: r.slug,
      title: r.title,
      serious:
        cfeNeedsAiRepair(diag) ||
        extra.some((e) =>
          ["cook_left_of_mix", "wok_not_accumulated"].includes(e.code),
        ),
      issues: all.map((i) => `${i.code}:${i.detail}`),
    });
  }

  bySlug.sort(
    (a, b) => Number(b.serious) - Number(a.serious) || b.issues.length - a.issues.length,
  );

  console.log(
    JSON.stringify(
      {
        total: recipes.length,
        clean,
        flagged: bySlug.length,
        serious: bySlug.filter((x) => x.serious).length,
        tally,
      },
      null,
      2,
    ),
  );
  console.log("\n--- SERIOUS ---");
  for (const f of bySlug.filter((x) => x.serious).slice(0, 25)) {
    console.log(`\n${f.slug}`);
    console.log(f.issues.join("\n"));
  }
  console.log("\n--- SOFT (top 15) ---");
  for (const f of bySlug.filter((x) => !x.serious).slice(0, 15)) {
    console.log(`\n${f.slug}`);
    console.log(f.issues.join("\n"));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
