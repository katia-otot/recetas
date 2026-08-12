import "../src/lib/load-env";
import { prisma } from "../src/lib/db";

async function main() {
  const total = await prisma.recipe.count();
  const statuses = await prisma.recipe.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const sample = await prisma.recipe.findFirst({
    where: { title: "Seitan" },
    select: {
      title: true,
      status: true,
      ingredientsJson: true,
      stepsJson: true,
      versionsJson: true,
      cfeJson: true,
    },
  });
  console.log({ total, statuses, sample });
}

main().catch(console.error);
