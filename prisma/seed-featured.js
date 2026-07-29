/**
 * Flags the homepage "Shop by category" tiles (Category.showOnHome +
 * homeSortOrder) and gives each a placeholder image. Deliberately picks
 * sub-categories, not roots — the roots already live in the navbar, so the
 * homepage section spotlights the shelves people actually browse to.
 *
 * Plain JS on purpose -- tsconfig only compiles src/. Run with:
 *
 *   node prisma/seed-featured.js
 *
 * Idempotent: matched by slug, clears the flag from anything not listed, so
 * a re-run always converges to exactly this set. Images are only filled in
 * when the category has none, so an admin-uploaded photo survives a re-run.
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const FEATURED = [
  "sarees-ethnic",
  "womens-dresses",
  "mens-panjabi",
  "womens-heels",
  "handbags",
  "lipstick",
  "kids-sets-frocks",
  "mens-watches",
];

async function main() {
  const cleared = await prisma.category.updateMany({
    where: { showOnHome: true, slug: { notIn: FEATURED } },
    data: { showOnHome: false, homeSortOrder: 0 },
  });

  for (const [index, slug] of FEATURED.entries()) {
    const category = await prisma.category.findUnique({
      where: { slug },
      select: { id: true, image: true, name: true },
    });
    if (!category) {
      console.warn(`skip: no category with slug "${slug}"`);
      continue;
    }
    await prisma.category.update({
      where: { id: category.id },
      data: {
        showOnHome: true,
        homeSortOrder: index,
        ...(category.image
          ? {}
          : { image: `https://picsum.photos/seed/${slug}/600/750` }),
      },
    });
    console.log(`featured #${index}: ${category.name} (${slug})`);
  }

  console.log(`done. cleared ${cleared.count} stale flag(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
