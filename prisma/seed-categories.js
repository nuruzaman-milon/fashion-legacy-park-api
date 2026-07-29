/**
 * Seeds the category tree that powers the storefront navbar/megamenu.
 *
 * The structure mirrors the frontend's hand-curated menu
 * (fashion-legacy-frontend/src/config/nav-menu.ts) as of 2026-07-29: each
 * megamenu column is a level-2 category, each column link a level-3 leaf.
 * Root slugs match the links the live navbar already emits.
 *
 * Plain JS on purpose -- tsconfig only compiles src/, so a .ts file here
 * could not run without extra tooling. Run with:
 *
 *   node prisma/seed-categories.js
 *
 * Idempotent: rows are matched by slug; re-running updates name/parent/order
 * and never duplicates. Categories the script does not know about are left
 * untouched, so admin-created ones survive a re-run.
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const TREE = [
  {
    name: "Women",
    slug: "womens-wear",
    children: [
      {
        name: "Clothing",
        slug: "womens-clothing",
        children: [
          { name: "Tops", slug: "womens-tops" },
          { name: "T-Shirts", slug: "womens-t-shirts" },
          { name: "Shirts", slug: "womens-shirts" },
          { name: "Dresses", slug: "womens-dresses" },
          { name: "Jeans", slug: "womens-jeans" },
          { name: "Pants", slug: "womens-pants" },
          { name: "Jackets & Blazers", slug: "womens-jackets-blazers" },
          { name: "Knitwear", slug: "womens-knitwear" },
          // Kept from the old static config -- the live menu links this slug.
          { name: "Sarees & Ethnic", slug: "sarees-ethnic" },
        ],
      },
      {
        name: "Footwear",
        slug: "womens-footwear",
        children: [
          { name: "Sneakers", slug: "womens-sneakers" },
          { name: "Flats", slug: "womens-flats" },
          { name: "Heels", slug: "womens-heels" },
          { name: "Sandals", slug: "womens-sandals" },
          { name: "Boots", slug: "womens-boots" },
        ],
      },
      {
        name: "Accessories",
        slug: "womens-accessories",
        children: [
          { name: "Bags", slug: "womens-bags" },
          { name: "Watches", slug: "womens-watches" },
          { name: "Sunglasses", slug: "womens-sunglasses" },
          { name: "Jewelry", slug: "womens-jewelry" },
          { name: "Scarves", slug: "womens-scarves" },
          { name: "Belts", slug: "womens-belts" },
          { name: "Wallets", slug: "womens-wallets" },
        ],
      },
    ],
  },
  {
    name: "Men",
    slug: "mens-wear",
    children: [
      {
        name: "Clothing",
        slug: "mens-clothing",
        children: [
          { name: "T-Shirts", slug: "mens-t-shirts" },
          { name: "Polos", slug: "mens-polos" },
          { name: "Shirts", slug: "mens-shirts" },
          { name: "Panjabi", slug: "mens-panjabi" },
          { name: "Jeans", slug: "mens-jeans" },
          { name: "Trousers", slug: "mens-trousers" },
          { name: "Jackets", slug: "mens-jackets" },
          { name: "Sweaters", slug: "mens-sweaters" },
        ],
      },
      {
        name: "Footwear",
        slug: "mens-footwear",
        children: [
          { name: "Sneakers", slug: "mens-sneakers" },
          { name: "Loafers", slug: "mens-loafers" },
          { name: "Formal Shoes", slug: "mens-formal-shoes" },
          { name: "Sandals", slug: "mens-sandals" },
          { name: "Boots", slug: "mens-boots" },
        ],
      },
      {
        name: "Accessories",
        slug: "mens-accessories",
        children: [
          { name: "Watches", slug: "mens-watches" },
          { name: "Belts", slug: "mens-belts" },
          { name: "Wallets", slug: "mens-wallets" },
          { name: "Sunglasses", slug: "mens-sunglasses" },
          { name: "Caps", slug: "mens-caps" },
        ],
      },
    ],
  },
  {
    name: "Kids",
    slug: "kids",
    children: [
      {
        name: "Clothing",
        slug: "kids-clothing",
        children: [
          { name: "T-Shirts", slug: "kids-t-shirts" },
          { name: "Sets & Frocks", slug: "kids-sets-frocks" },
          { name: "Sweaters", slug: "kids-sweaters" },
          { name: "School Wear", slug: "kids-school-wear" },
          { name: "Ethnic Wear", slug: "kids-ethnic-wear" },
        ],
      },
      {
        name: "Footwear",
        slug: "kids-footwear",
        children: [
          { name: "Sneakers", slug: "kids-sneakers" },
          { name: "Sandals", slug: "kids-sandals" },
          { name: "School Shoes", slug: "kids-school-shoes" },
        ],
      },
      {
        name: "Essentials",
        slug: "kids-essentials",
        children: [
          { name: "Backpacks", slug: "kids-backpacks" },
          { name: "Caps", slug: "kids-caps" },
          { name: "Socks", slug: "kids-socks" },
        ],
      },
    ],
  },
  {
    name: "Accessories",
    slug: "accessories",
    children: [
      {
        name: "Bags",
        slug: "accessories-bags",
        children: [
          { name: "Handbags", slug: "handbags" },
          { name: "Backpacks", slug: "backpacks" },
          { name: "Wallets", slug: "wallets" },
        ],
      },
      {
        name: "Jewelry & Watches",
        slug: "accessories-jewelry-watches",
        children: [
          { name: "Watches", slug: "watches" },
          { name: "Earrings", slug: "earrings" },
          { name: "Necklaces", slug: "necklaces" },
          { name: "Rings", slug: "rings" },
        ],
      },
      {
        name: "More",
        slug: "accessories-more",
        children: [
          { name: "Sunglasses", slug: "sunglasses" },
          { name: "Belts", slug: "belts" },
          { name: "Scarves", slug: "scarves" },
          { name: "Caps", slug: "caps" },
        ],
      },
    ],
  },
  {
    // Not in the static navbar, but the homepage mock and nav-menu.ts
    // `productsFrom` both reference the cosmetics slug -- the storefront
    // clearly intends to sell it, so it gets a real root (last in the nav).
    name: "Cosmetics",
    slug: "cosmetics",
    children: [
      {
        name: "Makeup",
        slug: "cosmetics-makeup",
        children: [
          { name: "Lipstick", slug: "lipstick" },
          { name: "Face Makeup", slug: "face-makeup" },
          { name: "Eye Makeup", slug: "eye-makeup" },
        ],
      },
      {
        name: "Skincare",
        slug: "cosmetics-skincare",
        children: [
          { name: "Moisturizers", slug: "moisturizers" },
          { name: "Cleansers", slug: "cleansers" },
        ],
      },
    ],
  },
];

const stats = { created: 0, updated: 0 };

const upsertLevel = async (nodes, parentId) => {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const data = {
      name: node.name,
      parentId: parentId ?? null,
      sortOrder: i + 1,
      isActive: true,
    };

    const existing = await prisma.category.findUnique({
      where: { slug: node.slug },
      select: { id: true },
    });

    let id;
    if (existing) {
      await prisma.category.update({ where: { id: existing.id }, data });
      id = existing.id;
      stats.updated++;
    } else {
      const created = await prisma.category.create({
        data: { ...data, slug: node.slug },
      });
      id = created.id;
      stats.created++;
    }

    if (node.children) {
      await upsertLevel(node.children, id);
    }
  }
};

(async () => {
  await upsertLevel(TREE, null);
  console.log(
    `Category seed complete: ${stats.created} created, ${stats.updated} updated.`,
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
