/**
 * Seeds dummy products for frontend integration testing.
 *
 * - Recreates the 12 products from the frontend's mock data
 *   (fashion-legacy-frontend/src/lib/api/mock/home-data.ts) with the SAME
 *   slugs, prices and image paths, so the frontend's local images render.
 * - Adds filler products across every category leaf, with hand-picked
 *   Unsplash photos matching each product (FILLER_IMG). Re-running also
 *   upgrades any old picsum placeholder images left on existing products.
 * - Wires a "Size" option + variants for the three multi-price mock products,
 *   so the product detail page's variant picker is testable.
 * - Pins 3-4 products per root category (megamenu "Our Recommendation").
 * - Creates one live 7-day flash sale with PRODUCT rules and capped items.
 *
 * Run AFTER seed-categories.js:
 *
 *   node prisma/seed-products.js
 *
 * Idempotent-ish: a product whose slug already exists is skipped (never
 * updated), menu pins are replaced, the flash sale is skipped if its title
 * exists. Ratings/soldCount are display dummies -- there are no Review rows
 * behind avgRating.
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const localImg = (slug) => `/images/products/${slug}.jpg`;
const picsum = (slug) => `https://picsum.photos/seed/${slug}/600/800`;

// Hand-picked Unsplash photos that actually depict each filler product
// (picsum returned random landscapes, which looked wrong on the storefront).
// Each URL was visually verified against the product name before being added.
const FILLER_IMG = {
  "pastel-chiffon-top": "https://images.unsplash.com/photo-1608234807905-4466023792f5?auto=format&fit=crop&w=600&h=800&q=80",
  "embroidered-cotton-top": "https://images.unsplash.com/photo-1632754724733-a220cd51b7d2?auto=format&fit=crop&w=600&h=800&q=80",
  "relaxed-graphic-tee": "https://images.unsplash.com/photo-1610142991820-e02266a4a9f0?auto=format&fit=crop&w=600&h=800&q=80",
  "white-poplin-shirt": "https://images.unsplash.com/photo-1583846783214-7229a91b20ed?auto=format&fit=crop&w=600&h=800&q=80",
  "high-rise-skinny-jeans": "https://images.unsplash.com/photo-1475178626620-a4d074967452?auto=format&fit=crop&w=600&h=800&q=80",
  "wide-leg-palazzo-pants": "https://images.unsplash.com/photo-1687825515654-23620796760c?auto=format&fit=crop&w=600&h=800&q=80",
  "cropped-denim-jacket": "https://images.unsplash.com/photo-1577660002965-04865592fc60?auto=format&fit=crop&w=600&h=800&q=80",
  "ribbed-soft-cardigan": "https://images.unsplash.com/photo-1683315565563-f72590773805?auto=format&fit=crop&w=600&h=800&q=80",
  "jamdani-motif-saree": "https://images.unsplash.com/photo-1739429942851-9083ee185d3d?auto=format&fit=crop&w=600&h=800&q=80",
  "katan-silk-saree": "https://images.unsplash.com/photo-1641699862936-be9f49b1c38d?auto=format&fit=crop&w=600&h=800&q=80",
  "nude-ballet-flats": "https://images.unsplash.com/photo-1720604083961-88336789791e?auto=format&fit=crop&w=600&h=800&q=80",
  "strappy-block-sandals": "https://images.unsplash.com/photo-1630407332126-70ebb700976b?auto=format&fit=crop&w=600&h=800&q=80",
  "quilted-crossbody-bag": "https://images.unsplash.com/photo-1760624294514-3548bee70d26?auto=format&fit=crop&w=600&h=800&q=80",
  "gold-plated-jhumka": "https://images.unsplash.com/photo-1714733831162-0a6e849141be?auto=format&fit=crop&w=600&h=800&q=80",
  "navy-pique-polo": "https://images.unsplash.com/photo-1625910513413-c23b8bb81cba?auto=format&fit=crop&w=600&h=800&q=80",
  "emerald-silk-panjabi": "https://images.unsplash.com/photo-1774171312574-c468f3f5f0fa?auto=format&fit=crop&w=600&h=800&q=80",
  "white-cotton-panjabi": "https://images.unsplash.com/photo-1774527929750-f2f32fbb3b93?auto=format&fit=crop&w=600&h=800&q=80",
  "slim-tapered-jeans": "https://images.unsplash.com/photo-1714143136372-ddaf8b606da7?auto=format&fit=crop&w=600&h=800&q=80",
  "wool-blend-trousers": "https://images.unsplash.com/photo-1624835567150-0c530a20d8cc?auto=format&fit=crop&w=600&h=800&q=80",
  "merino-crewneck-sweater": "https://images.unsplash.com/photo-1610901157620-340856d0a50f?auto=format&fit=crop&w=600&h=800&q=80",
  "tan-penny-loafers": "https://images.unsplash.com/photo-1777987601447-266e128de448?auto=format&fit=crop&w=600&h=800&q=80",
  "leather-slide-sandals": "https://images.unsplash.com/photo-1585120824848-8a5cd41493d2?auto=format&fit=crop&w=600&h=800&q=80",
  "minimalist-steel-watch": "https://images.unsplash.com/photo-1582150264904-e0bea5ef0ad1?auto=format&fit=crop&w=600&h=800&q=80",
  "full-grain-leather-belt": "https://images.unsplash.com/photo-1664285612706-b32633c95820?auto=format&fit=crop&w=600&h=800&q=80",
  "bifold-leather-wallet": "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=600&h=800&q=80",
  "dino-print-tee": "https://images.unsplash.com/photo-1563773617060-f29607ce70a1?auto=format&fit=crop&w=600&h=800&q=80",
  "floral-party-frock": "https://images.unsplash.com/photo-1620774760711-caa4c94d683a?auto=format&fit=crop&w=600&h=800&q=80",
  "chunky-knit-pullover": "https://images.unsplash.com/photo-1631541911232-72bc7448820a?auto=format&fit=crop&w=600&h=800&q=80",
  "school-uniform-shirt": "https://images.unsplash.com/photo-1698992939360-7a413b5419ce?auto=format&fit=crop&w=600&h=800&q=80",
  "velcro-light-up-sneakers": "https://images.unsplash.com/photo-1678192568478-9488ee55def6?auto=format&fit=crop&w=600&h=800&q=80",
  "cartoon-mini-backpack": "https://images.unsplash.com/photo-1742986410468-0a173a45a21d?auto=format&fit=crop&w=600&h=800&q=80",
  "structured-tote-handbag": "https://images.unsplash.com/photo-1624687943971-e86af76d57de?auto=format&fit=crop&w=600&h=800&q=80",
  "urban-canvas-backpack": "https://images.unsplash.com/photo-1491637639811-60e2756cc1c7?auto=format&fit=crop&w=600&h=800&q=80",
  "slim-card-wallet": "https://images.unsplash.com/photo-1614330315526-166f2d71e544?auto=format&fit=crop&w=600&h=800&q=80",
  "rose-gold-watch": "https://images.unsplash.com/photo-1525740664269-1bb17f251737?auto=format&fit=crop&w=600&h=800&q=80",
  "pearl-drop-earrings": "https://images.unsplash.com/photo-1682822749969-61a63203c501?auto=format&fit=crop&w=600&h=800&q=80",
  "layered-chain-necklace": "https://images.unsplash.com/photo-1633810542706-90e5ff7557be?auto=format&fit=crop&w=600&h=800&q=80",
  "adjustable-stone-ring": "https://images.unsplash.com/photo-1611087388916-b6c97e01735b?auto=format&fit=crop&w=600&h=800&q=80",
  "retro-round-sunglasses": "https://images.unsplash.com/photo-1649119161997-00ffc8c24e11?auto=format&fit=crop&w=600&h=800&q=80",
  "printed-silk-scarf": "https://images.unsplash.com/photo-1623832101940-647285e32a58?auto=format&fit=crop&w=600&h=800&q=80",
  "classic-baseball-cap": "https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=600&h=800&q=80",
};

// The frontend's 12 mock products. `sizes` spreads the price range across
// real Size variants; a lone price gets one "Default" variant.
const MOCK = [
  { cat: "womens-dresses", name: "Scarlet Taffeta Party Gown", slug: "scarlet-party-gown", img: localImg("scarlet-party-gown"), featured: true, rating: 4.8, reviews: 214, sold: 890, published: "2026-07-15", variants: [{ price: 5900, compare: 7200, stock: 18 }] },
  { cat: "womens-dresses", name: "Sky Blue Dotted Wrap Maxi", slug: "sky-wrap-maxi-dress", img: localImg("sky-wrap-maxi-dress"), featured: true, rating: 4.7, reviews: 167, sold: 421, published: "2026-07-12", variants: [{ price: 3450, compare: 4200, stock: 26 }] },
  { cat: "womens-dresses", name: "Ivory Floral Wrap Dress", slug: "ivory-floral-wrap-dress", img: localImg("ivory-floral-wrap-dress"), rating: 4.6, reviews: 128, sold: 640, published: "2026-07-18", variants: [{ size: "S", price: 2890, compare: 3500, stock: 14 }, { size: "M", price: 2990, compare: 3500, stock: 14 }, { size: "L", price: 2990, compare: 3500, stock: 14 }] },
  { cat: "mens-shirts", name: "Chambray Printed Casual Shirt", slug: "chambray-casual-shirt", img: localImg("chambray-casual-shirt"), rating: 4.4, reviews: 73, sold: 388, published: "2026-07-20", variants: [{ size: "M", price: 1650, compare: 2100, stock: 45 }, { size: "L", price: 1750, compare: 2100, stock: 45 }] },
  { cat: "mens-t-shirts", name: "Essential Cotton Crew Tee", slug: "essential-crew-tee", img: localImg("essential-crew-tee"), rating: 4.5, reviews: 305, sold: 1240, published: "2026-07-21", variants: [{ price: 690, compare: 900, stock: 200 }] },
  { cat: "mens-jackets", name: "Midnight Slim-Fit Blazer Set", slug: "midnight-slim-blazer", img: localImg("midnight-slim-blazer"), featured: true, rating: 4.8, reviews: 96, sold: 212, published: "2026-07-16", variants: [{ size: "M", price: 7900, stock: 11 }, { size: "L", price: 8400, stock: 11 }] },
  { cat: "mens-sneakers", name: "Crimson Knit Running Sneakers", slug: "crimson-knit-sneakers", img: localImg("crimson-knit-sneakers"), featured: true, rating: 4.7, reviews: 232, sold: 578, published: "2026-07-14", variants: [{ price: 4500, compare: 5500, stock: 38 }] },
  { cat: "mens-formal-shoes", name: "Teal Suede Brogue Shoes", slug: "teal-suede-brogues", img: localImg("teal-suede-brogues"), rating: 4.6, reviews: 89, sold: 167, published: "2026-07-22", variants: [{ price: 3800, stock: 30 }] },
  { cat: "womens-heels", name: "Azure Floral Satin Heels", slug: "azure-floral-heels", img: localImg("azure-floral-heels"), rating: 4.5, reviews: 62, sold: 289, published: "2026-07-17", variants: [{ price: 3200, compare: 3900, stock: 24 }] },
  { cat: "lipstick", name: "Velvet Red Lip Duo", slug: "velvet-red-lip-duo", img: localImg("velvet-red-lip-duo"), featured: true, rating: 4.8, reviews: 321, sold: 980, published: "2026-07-19", variants: [{ price: 1450, compare: 1800, stock: 120 }] },
  { cat: "moisturizers", name: "Daily Skincare Trio Set", slug: "daily-skincare-trio", img: localImg("daily-skincare-trio"), rating: 4.6, reviews: 143, sold: 356, published: "2026-07-21", variants: [{ price: 2200, stock: 64 }] },
  { cat: "face-makeup", name: "Pro Makeup Studio Collection", slug: "pro-makeup-collection", img: localImg("pro-makeup-collection"), featured: true, rating: 4.9, reviews: 167, sold: 305, published: "2026-07-10", variants: [{ price: 5200, compare: 6500, stock: 15 }] },
];

// [leafSlug, name, slug, price, comparePrice|null, stock, rating, reviews, sold, featured]
const FILLERS = [
  ["womens-tops", "Pastel Chiffon Top", "pastel-chiffon-top", 1250, 1500, 60, 4.4, 48, 210, 0],
  ["womens-tops", "Embroidered Cotton Top", "embroidered-cotton-top", 1450, null, 45, 4.3, 22, 95, 0],
  ["womens-t-shirts", "Relaxed Graphic Tee", "relaxed-graphic-tee", 850, 990, 120, 4.2, 35, 260, 0],
  ["womens-shirts", "White Poplin Shirt", "white-poplin-shirt", 1650, null, 70, 4.5, 41, 180, 0],
  ["womens-jeans", "High-Rise Skinny Jeans", "high-rise-skinny-jeans", 2200, 2600, 55, 4.4, 66, 310, 0],
  ["womens-pants", "Wide-Leg Palazzo Pants", "wide-leg-palazzo-pants", 1800, null, 48, 4.3, 28, 140, 0],
  ["womens-jackets-blazers", "Cropped Denim Jacket", "cropped-denim-jacket", 2900, null, 32, 4.6, 52, 175, 0],
  ["womens-knitwear", "Ribbed Soft Cardigan", "ribbed-soft-cardigan", 2400, 2800, 40, 4.5, 33, 120, 0],
  ["sarees-ethnic", "Jamdani Motif Saree", "jamdani-motif-saree", 4800, 5500, 25, 4.8, 118, 420, 1],
  ["sarees-ethnic", "Katan Silk Saree", "katan-silk-saree", 7500, null, 15, 4.9, 74, 190, 1],
  ["womens-flats", "Nude Ballet Flats", "nude-ballet-flats", 1900, null, 36, 4.3, 27, 130, 0],
  ["womens-sandals", "Strappy Block Sandals", "strappy-block-sandals", 2100, 2500, 42, 4.4, 39, 165, 0],
  ["womens-bags", "Quilted Crossbody Bag", "quilted-crossbody-bag", 2650, 3200, 30, 4.7, 88, 340, 1],
  ["womens-jewelry", "Gold-Plated Jhumka Earrings", "gold-plated-jhumka", 950, 1200, 90, 4.6, 102, 480, 0],
  ["mens-polos", "Navy Pique Polo", "navy-pique-polo", 1150, 1400, 85, 4.4, 58, 290, 0],
  ["mens-panjabi", "Emerald Silk Panjabi", "emerald-silk-panjabi", 3200, 3800, 38, 4.8, 129, 510, 1],
  ["mens-panjabi", "White Cotton Panjabi", "white-cotton-panjabi", 1850, null, 60, 4.5, 76, 330, 0],
  ["mens-jeans", "Slim Tapered Jeans", "slim-tapered-jeans", 2400, null, 65, 4.4, 49, 240, 0],
  ["mens-trousers", "Wool-Blend Formal Trousers", "wool-blend-trousers", 2800, null, 44, 4.3, 31, 150, 0],
  ["mens-sweaters", "Merino Crewneck Sweater", "merino-crewneck-sweater", 3100, 3600, 28, 4.6, 44, 130, 0],
  ["mens-loafers", "Tan Penny Loafers", "tan-penny-loafers", 3400, null, 26, 4.5, 37, 145, 0],
  ["mens-sandals", "Leather Slide Sandals", "leather-slide-sandals", 1600, null, 58, 4.2, 25, 170, 0],
  ["mens-watches", "Minimalist Steel Watch", "minimalist-steel-watch", 4500, 5200, 22, 4.7, 91, 260, 1],
  ["mens-belts", "Full-Grain Leather Belt", "full-grain-leather-belt", 1250, null, 75, 4.5, 63, 300, 0],
  ["mens-wallets", "Bifold Leather Wallet", "bifold-leather-wallet", 980, 1200, 95, 4.4, 82, 410, 0],
  ["kids-t-shirts", "Dino Print Tee", "dino-print-tee", 550, 700, 140, 4.6, 95, 520, 0],
  ["kids-sets-frocks", "Floral Party Frock", "floral-party-frock", 1450, 1800, 50, 4.7, 68, 280, 0],
  ["kids-sweaters", "Chunky Knit Pullover", "chunky-knit-pullover", 1200, null, 45, 4.4, 21, 90, 0],
  ["kids-school-wear", "School Uniform Shirt", "school-uniform-shirt", 650, null, 160, 4.3, 44, 380, 0],
  ["kids-sneakers", "Velcro Light-Up Sneakers", "velcro-light-up-sneakers", 1600, 1900, 55, 4.7, 83, 350, 1],
  ["kids-backpacks", "Cartoon Mini Backpack", "cartoon-mini-backpack", 1100, null, 70, 4.5, 57, 240, 0],
  ["handbags", "Structured Tote Handbag", "structured-tote-handbag", 3200, 3800, 28, 4.6, 71, 220, 1],
  ["backpacks", "Urban Canvas Backpack", "urban-canvas-backpack", 2400, null, 40, 4.4, 53, 260, 0],
  ["wallets", "Slim Card Wallet", "slim-card-wallet", 750, null, 110, 4.3, 36, 310, 0],
  ["watches", "Rose Gold Watch", "rose-gold-watch", 5200, 6000, 18, 4.8, 104, 290, 1],
  ["earrings", "Pearl Drop Earrings", "pearl-drop-earrings", 850, null, 88, 4.5, 47, 230, 0],
  ["necklaces", "Layered Chain Necklace", "layered-chain-necklace", 1100, 1350, 66, 4.4, 39, 180, 0],
  ["rings", "Adjustable Stone Ring", "adjustable-stone-ring", 650, null, 120, 4.2, 23, 150, 0],
  ["sunglasses", "Retro Round Sunglasses", "retro-round-sunglasses", 1450, 1800, 72, 4.5, 61, 270, 0],
  ["scarves", "Printed Silk Scarf", "printed-silk-scarf", 1250, null, 54, 4.4, 26, 110, 0],
  ["caps", "Classic Baseball Cap", "classic-baseball-cap", 590, null, 130, 4.3, 48, 340, 0],
];

const MENU_PINS = {
  "womens-wear": ["scarlet-party-gown", "sky-wrap-maxi-dress", "jamdani-motif-saree", "quilted-crossbody-bag"],
  "mens-wear": ["midnight-slim-blazer", "emerald-silk-panjabi", "crimson-knit-sneakers", "minimalist-steel-watch"],
  kids: ["dino-print-tee", "floral-party-frock", "velcro-light-up-sneakers", "cartoon-mini-backpack"],
  accessories: ["rose-gold-watch", "structured-tote-handbag", "retro-round-sunglasses", "layered-chain-necklace"],
  cosmetics: ["velvet-red-lip-duo", "pro-makeup-collection", "daily-skincare-trio"],
};

// [productSlug, discountType, discountValue, maxDiscount|null, quantityLimit]
const FLASH_SALE = {
  title: "Weekend Flash Deals",
  rules: [
    ["scarlet-party-gown", "PERCENTAGE", 20, 1500, 50],
    ["essential-crew-tee", "FIXED", 200, null, 100],
    ["crimson-knit-sneakers", "PERCENTAGE", 20, null, 40],
    ["velvet-red-lip-duo", "FIXED", 460, null, 80],
    ["jamdani-motif-saree", "PERCENTAGE", 15, null, 30],
    ["rose-gold-watch", "PERCENTAGE", 25, 1500, 25],
  ],
};

const SIZES = ["S", "M", "L", "XL"];

const stats = { created: 0, skipped: 0 };

const ensureSizeOption = async () => {
  let option = await prisma.option.findUnique({ where: { slug: "size" } });
  if (!option) {
    option = await prisma.option.create({ data: { name: "Size", slug: "size" } });
  }

  const values = {};
  for (let i = 0; i < SIZES.length; i++) {
    const size = SIZES[i];
    let value = await prisma.optionValue.findUnique({
      where: { optionId_value: { optionId: option.id, value: size } },
    });
    if (!value) {
      value = await prisma.optionValue.create({
        data: { optionId: option.id, value: size, slug: size.toLowerCase(), sortOrder: i + 1 },
      });
    }
    values[size] = value;
  }

  return { option, values };
};

const createProduct = async (def, categoryBySlug, sizeOption) => {
  const exists = await prisma.product.findUnique({
    where: { slug: def.slug },
    select: { id: true },
  });
  if (exists) {
    stats.skipped++;
    return;
  }

  const category = categoryBySlug.get(def.cat);
  if (!category) throw new Error(`Unknown category slug: ${def.cat}`);

  const prices = def.variants.map((v) => v.price);
  const totalStock = def.variants.reduce((sum, v) => sum + v.stock, 0);
  const hasSizes = def.variants.some((v) => v.size);

  const product = await prisma.product.create({
    data: {
      name: def.name,
      slug: def.slug,
      categoryId: category.id,
      status: "ACTIVE",
      publishedAt: new Date(`${def.published}T00:00:00.000Z`),
      shortDescription: `${def.name} — dummy seed product for frontend testing.`,
      isFeatured: !!def.featured,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      totalStock,
      soldCount: def.sold,
      avgRating: def.rating,
      reviewCount: def.reviews,
      images: {
        create: [{ url: def.img, alt: def.name, isPrimary: true }],
      },
      ...(hasSizes && {
        productOptions: { create: [{ optionId: sizeOption.option.id }] },
      }),
    },
  });

  for (let i = 0; i < def.variants.length; i++) {
    const v = def.variants[i];
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: v.size ?? "Default",
        sku: `${def.slug.toUpperCase()}${v.size ? `-${v.size}` : ""}`,
        price: v.price,
        comparePrice: v.compare ?? null,
        stock: v.stock,
        sortOrder: i + 1,
        isDefault: i === 0,
      },
    });

    if (v.size) {
      await prisma.productVariantOption.create({
        data: { variantId: variant.id, valueId: sizeOption.values[v.size].id },
      });
    }
  }

  stats.created++;
};

(async () => {
  const categories = await prisma.category.findMany({
    select: { id: true, slug: true },
  });
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  const sizeOption = await ensureSizeOption();

  for (const def of MOCK) {
    await createProduct(def, categoryBySlug, sizeOption);
  }

  // Fillers get staggered publish dates so sort=newest has an order to show.
  const base = Date.UTC(2026, 5, 1);
  for (let i = 0; i < FILLERS.length; i++) {
    const [cat, name, slug, price, compare, stock, rating, reviews, sold, featured] = FILLERS[i];
    await createProduct(
      {
        cat,
        name,
        slug,
        img: FILLER_IMG[slug] ?? picsum(slug),
        featured: featured === 1,
        rating,
        reviews,
        sold,
        published: new Date(base + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        variants: [{ price, compare, stock }],
      },
      categoryBySlug,
      sizeOption,
    );
  }

  // ---- upgrade picsum placeholders on already-seeded products ----
  let fixed = 0;
  for (const [slug, url] of Object.entries(FILLER_IMG)) {
    const updated = await prisma.productImage.updateMany({
      where: { url: { startsWith: "https://picsum.photos/" }, product: { slug } },
      data: { url },
    });
    fixed += updated.count;
  }
  if (fixed) console.log(`Upgraded ${fixed} picsum placeholder image(s).`);

  // ---- megamenu pins (replace per root) ----
  for (const [rootSlug, productSlugs] of Object.entries(MENU_PINS)) {
    const root = categoryBySlug.get(rootSlug);
    if (!root) continue;

    const products = await prisma.product.findMany({
      where: { slug: { in: productSlugs } },
      select: { id: true, slug: true },
    });
    const idBySlug = new Map(products.map((p) => [p.slug, p.id]));

    await prisma.categoryMenuProduct.deleteMany({
      where: { categoryId: root.id },
    });
    await prisma.categoryMenuProduct.createMany({
      data: productSlugs
        .filter((slug) => idBySlug.has(slug))
        .map((slug, i) => ({
          categoryId: root.id,
          productId: idBySlug.get(slug),
          sortOrder: i,
        })),
    });
  }

  // ---- one live flash sale ----
  const existingSale = await prisma.flashSale.findFirst({
    where: { title: FLASH_SALE.title },
  });

  if (!existingSale) {
    const slugs = FLASH_SALE.rules.map(([slug]) => slug);
    const products = await prisma.product.findMany({
      where: { slug: { in: slugs } },
      select: {
        id: true,
        slug: true,
        variants: { where: { isDefault: true }, select: { id: true } },
      },
    });
    const bySlug = new Map(products.map((p) => [p.slug, p]));

    await prisma.flashSale.create({
      data: {
        title: FLASH_SALE.title,
        description: "Dummy sale for frontend testing — 7 days from seed time.",
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        rules: {
          create: FLASH_SALE.rules
            .filter(([slug]) => bySlug.has(slug))
            .map(([slug, discountType, discountValue, maxDiscount]) => ({
              scope: "PRODUCT",
              productId: bySlug.get(slug).id,
              discountType,
              discountValue,
              maxDiscount,
            })),
        },
        items: {
          create: FLASH_SALE.rules
            .filter(([slug]) => bySlug.get(slug)?.variants[0])
            .map(([slug, , , , quantityLimit]) => ({
              variantId: bySlug.get(slug).variants[0].id,
              quantityLimit,
            })),
        },
      },
    });
    console.log("Flash sale created.");
  } else {
    console.log("Flash sale already exists, skipped.");
  }

  console.log(
    `Product seed complete: ${stats.created} created, ${stats.skipped} skipped (already existed).`,
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
