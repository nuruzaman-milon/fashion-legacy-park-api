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

// Hand-picked Unsplash photos matching each category (visually verified).
// Picsum placeholders returned random landscapes that clashed with the tiles.
const CATEGORY_IMG = {
  "sarees-ethnic": "https://images.unsplash.com/photo-1610313416458-8e435d6f7ed2?auto=format&fit=crop&w=600&h=750&q=80",
  "womens-dresses": "https://images.unsplash.com/photo-1640923160720-35dddb6348ab?auto=format&fit=crop&w=600&h=750&q=80",
  "mens-panjabi": "https://images.unsplash.com/photo-1634843824921-83bb75483c59?auto=format&fit=crop&w=600&h=750&q=80",
  "womens-heels": "https://images.unsplash.com/photo-1590099033615-be195f8d575c?auto=format&fit=crop&w=600&h=750&q=80",
  "handbags": "https://images.unsplash.com/photo-1597633125184-9fd7e54f0ff7?auto=format&fit=crop&w=600&h=750&q=80",
  "lipstick": "https://images.unsplash.com/photo-1626895872564-b691b6877b83?auto=format&fit=crop&w=600&h=750&q=80",
  "kids-sets-frocks": "https://images.unsplash.com/photo-1566454544259-f4b94c3d758c?auto=format&fit=crop&w=600&h=750&q=80",
  "mens-watches": "https://images.unsplash.com/photo-1670177257750-9b47927f68eb?auto=format&fit=crop&w=600&h=750&q=80",
};

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
        // Fill in when empty, and upgrade old picsum placeholders; an
        // admin-uploaded photo still survives a re-run.
        ...(!category.image || category.image.startsWith("https://picsum.photos/")
          ? { image: CATEGORY_IMG[slug] ?? `https://picsum.photos/seed/${slug}/600/750` }
          : {}),
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
