/**
 * Regenera CFE de recetas con errores semánticos serios y verifica el resultado.
 *
 * Uso:
 *   npx tsx scripts/ai/rebuild-bad-cfe.ts
 *   npx tsx scripts/ai/rebuild-bad-cfe.ts --slug=arroz-con-azafran-y-esparragos
 *   npx tsx scripts/ai/rebuild-bad-cfe.ts --dry-run
 */
import "../../src/lib/load-env";
import { prisma } from "../../src/lib/db";
import {
  cfeNeedsAiRepair,
  diagnoseCfeIssues,
  isUsableCfe,
  refineStoredCfe,
  type CfeIssue,
} from "../../src/lib/cfe";
import {
  parseStoredIngredients,
  type CfeData,
} from "../../src/lib/recipe-schema";
import { rebuildCfeFromClassic } from "../../src/lib/structure-recipe";

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function seriousIssues(issues: CfeIssue[]): CfeIssue[] {
  return issues.filter((i) => cfeNeedsAiRepair([i]));
}

function summarize(issues: CfeIssue[]): string {
  if (issues.length === 0) return "(limpio)";
  return issues.map((i) => `${i.code}`).join(", ");
}

async function main() {
  const onlySlug = argValue("slug");
  const onlySlugs = (argValue("slugs") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const dryRun = hasFlag("dry-run");
  const delayMs = Number(argValue("delay") ?? "1500");
  const force = hasFlag("force") || onlySlugs.length > 0 || Boolean(onlySlug);

  const recipes = await prisma.recipe.findMany({
    where: {
      status: "estructurado",
      ...(onlySlug
        ? { slug: onlySlug }
        : onlySlugs.length > 0
          ? { slug: { in: onlySlugs } }
          : { cfeJson: { not: null } }),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      ingredientsJson: true,
      stepsJson: true,
      cfeJson: true,
    },
    orderBy: { title: "asc" },
  });

  const targets: Array<{
    id: string;
    title: string;
    slug: string;
    ingredients: ReturnType<typeof parseStoredIngredients>;
    steps: string[];
    before: CfeIssue[];
  }> = [];

  for (const recipe of recipes) {
    const raw = JSON.parse(recipe.cfeJson || "null") as CfeData | null;
    const refined = raw ? refineStoredCfe(raw) ?? raw : null;
    const issues = refined ? diagnoseCfeIssues(refined) : [];
    const serious = seriousIssues(issues);
    const missingCfe = !raw || !refined;
    if (!force && serious.length === 0 && !missingCfe) continue;

    const ingredients = parseStoredIngredients(
      JSON.parse(recipe.ingredientsJson || "[]"),
    );
    const steps = JSON.parse(recipe.stepsJson || "[]") as string[];
    if (ingredients.length === 0 || steps.length === 0) {
      console.log(`SKIP (sin clásico): ${recipe.title}`);
      continue;
    }

    targets.push({
      id: recipe.id,
      title: recipe.title,
      slug: recipe.slug,
      ingredients,
      steps,
      before:
        serious.length > 0
          ? serious
          : issues.length > 0
            ? issues
            : [{ code: "empty_actions", detail: "force rebuild" }],
    });
  }

  console.log(
    `A regenerar: ${targets.length} recetas${dryRun ? " (dry-run)" : ""}`,
  );
  for (const t of targets) {
    console.log(`  - ${t.slug}: ${summarize(t.before)}`);
  }
  if (dryRun || targets.length === 0) return;

  let ok = 0;
  let improved = 0;
  let failed = 0;
  let stillBad = 0;
  const leftovers: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const label = `[${i + 1}/${targets.length}] ${target.title}`;
    try {
      const rebuilt = await rebuildCfeFromClassic({
        title: target.title,
        ingredients: target.ingredients,
        steps: target.steps,
      });

      if (!rebuilt || !isUsableCfe(rebuilt)) {
        failed += 1;
        console.error(`${label}: FAIL (CFE no usable)`);
      } else {
        const after = diagnoseCfeIssues(rebuilt);
        const afterSerious = seriousIssues(after);
        const beforeCount = seriousIssues(target.before).length || target.before.length;
        const afterCount = afterSerious.length;

        await prisma.recipe.update({
          where: { id: target.id },
          data: { cfeJson: JSON.stringify(rebuilt) },
        });

        ok += 1;
        if (afterCount < beforeCount) improved += 1;
        if (afterCount > 0) {
          stillBad += 1;
          leftovers.push(
            `${target.slug}: ${summarize(afterSerious)} (antes: ${summarize(seriousIssues(target.before).length ? seriousIssues(target.before) : target.before)})`,
          );
          console.warn(
            `${label}: OK pero sigue con issues → ${summarize(afterSerious)}`,
          );
        } else {
          console.log(`${label}: OK limpio (antes: ${summarize(target.before)})`);
        }
      }
    } catch (error) {
      failed += 1;
      console.error(`${label}: ERROR`, (error as Error).message);
    }

    if (i < targets.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  console.log(
    JSON.stringify(
      {
        targets: targets.length,
        ok,
        improved,
        failed,
        stillBad,
        leftovers,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
