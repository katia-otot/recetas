import "../src/lib/load-env";
import { prisma } from "../src/lib/db";

const slug = process.argv[2] ?? "berenjenas-a-la-pizza";

async function main() {
  const r = await prisma.recipe.findFirst({
    where: {
      OR: [{ slug }, { title: { contains: slug } }],
    },
    select: {
      title: true,
      slug: true,
      status: true,
      ingredientsJson: true,
      stepsJson: true,
      cfeJson: true,
    },
  });

  if (!r) {
    const all = await prisma.recipe.findMany({
      where: { title: { contains: "berenjena" } },
      select: { title: true, slug: true, status: true },
    });
    console.log("NOT FOUND for", slug);
    console.log("Matches:", all);
    return;
  }

  console.log("TITLE:", r.title);
  console.log("SLUG:", r.slug);
  console.log("STATUS:", r.status);
  console.log("---INGREDIENTS---");
  console.log(JSON.stringify(JSON.parse(r.ingredientsJson || "[]"), null, 2));
  console.log("---STEPS---");
  console.log(JSON.stringify(JSON.parse(r.stepsJson || "[]"), null, 2));
  console.log("---CFE---");
  console.log(JSON.stringify(JSON.parse(r.cfeJson || "null"), null, 2));
}

main()
  .finally(() => prisma.$disconnect());
