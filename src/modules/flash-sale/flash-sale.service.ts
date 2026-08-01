import { FlashSale, Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { visibleWhere } from "../product/browse.service";
import { applyRule, toNum } from "./flash-pricing";
import {
  paginate,
  Paginated,
  toPrismaOrderBy,
  toPrismaPaging,
} from "../../utils/pagination";
import {
  CreateFlashSaleInput,
  ListFlashSalesQuery,
  SetItemsInput,
  SetRulesInput,
  UpdateFlashSaleInput,
} from "./flash-sale.validation";

const SORTABLE = ["startsAt", "endsAt", "createdAt", "title"] as const;

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/**
 * The sale featured on the storefront right now.
 *
 * Overlapping active sales are legal in the schema, so selection must be
 * deterministic: the most recently started wins, createdAt as the final
 * tiebreak (FEATURE.md §10).
 */
export const getActiveSale = async () => {
  const now = new Date();

  const sale = await prisma.flashSale.findFirst({
    where: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
  });

  if (!sale) return null;

  const [rules, items, categories] = await Promise.all([
    prisma.flashSaleRule.findMany({ where: { flashSaleId: sale.id } }),
    prisma.flashSaleItem.findMany({
      where: {
        flashSaleId: sale.id,
        // The sale never shows what the storefront itself would hide.
        variant: { isActive: true, product: visibleWhere },
      },
      select: {
        quantityLimit: true,
        soldCount: true,
        variant: {
          select: {
            id: true,
            name: true,
            price: true,
            comparePrice: true,
            stock: true,
            reservedStock: true,
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                categoryId: true,
                avgRating: true,
                reviewCount: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { url: true, alt: true },
                },
              },
            },
          },
        },
      },
    }),
    // For CATEGORY-scoped rules: a rule on "Women" must reach a product that
    // lives on the "Tops" leaf, so matching walks the ancestor chain.
    prisma.category.findMany({ select: { id: true, parentId: true } }),
  ]);

  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));

  const ancestry = (categoryId: string): Set<string> => {
    const seen = new Set<string>();
    let cursor: string | null | undefined = categoryId;

    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }

    return seen;
  };

  const variantRules = rules.filter((r) => r.scope === "VARIANT");
  const productRules = rules.filter((r) => r.scope === "PRODUCT");
  const categoryRules = rules.filter((r) => r.scope === "CATEGORY");

  type Card = {
    variantId: string;
    variantName: string;
    price: Prisma.Decimal;
    comparePrice: Prisma.Decimal | null;
    flashPrice: string;
    quantityLimit: number | null;
    soldCount: number;
    remaining: number | null;
    available: number;
    variantCount: number;
    product: Omit<(typeof items)[number]["variant"]["product"], "categoryId">;
  };

  const cards: Card[] = [];

  for (const item of items) {
    const { variant } = item;
    const price = toNum(variant.price);

    // VARIANT > PRODUCT > CATEGORY (FEATURE.md §10). Within a tier the lowest
    // resulting price wins, keeping overlapping rules deterministic.
    const lineage = ancestry(variant.product.categoryId);
    const tiers = [
      variantRules.filter((r) => r.variantId === variant.id),
      productRules.filter((r) => r.productId === variant.product.id),
      categoryRules.filter((r) => r.categoryId && lineage.has(r.categoryId)),
    ];

    const matched = tiers.find((tier) => tier.length > 0);

    // An item no rule prices isn't on sale -- listing it at full price would
    // make the flash-sale section lie.
    if (!matched) continue;

    const flashPrice = Math.min(...matched.map((r) => applyRule(price, r)));

    const { categoryId: _categoryId, ...product } = variant.product;

    cards.push({
      variantId: variant.id,
      variantName: variant.name,
      price: variant.price,
      comparePrice: variant.comparePrice,
      flashPrice: flashPrice.toFixed(2),
      quantityLimit: item.quantityLimit,
      soldCount: item.soldCount,
      remaining:
        item.quantityLimit === null
          ? null
          : Math.max(0, item.quantityLimit - item.soldCount),
      available: Math.max(0, variant.stock - variant.reservedStock),
      variantCount: 1,
      product,
    });
  }

  // ONE card per product, not one per variant -- four colours of a watch are
  // one deal, not four duplicate tiles. The cheapest flash price fronts the
  // card; caps, sold counts and stock aggregate across the variants (any
  // uncapped variant makes the product uncapped).
  const byProduct = new Map<string, Card>();

  for (const card of cards) {
    const existing = byProduct.get(card.product.id);
    if (!existing) {
      byProduct.set(card.product.id, card);
      continue;
    }
    if (Number(card.flashPrice) < Number(existing.flashPrice)) {
      existing.variantId = card.variantId;
      existing.variantName = card.variantName;
      existing.price = card.price;
      existing.comparePrice = card.comparePrice;
      existing.flashPrice = card.flashPrice;
    }
    existing.soldCount += card.soldCount;
    existing.quantityLimit =
      existing.quantityLimit === null || card.quantityLimit === null
        ? null
        : existing.quantityLimit + card.quantityLimit;
    existing.remaining =
      existing.remaining === null || card.remaining === null
        ? null
        : existing.remaining + card.remaining;
    existing.available += card.available;
    existing.variantCount += 1;
  }

  return {
    id: sale.id,
    title: sale.title,
    description: sale.description,
    banner: sale.banner,
    startsAt: sale.startsAt,
    endsAt: sale.endsAt,
    items: [...byProduct.values()],
  };
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const ensureSale = async (id: string): Promise<FlashSale> => {
  const sale = await prisma.flashSale.findUnique({ where: { id } });

  if (!sale) {
    throw new ApiError(404, "Flash sale not found");
  }

  return sale;
};

export const listSales = async (
  query: ListFlashSalesQuery,
): Promise<Paginated<FlashSale & { _count: { rules: number; items: number } }>> => {
  const now = new Date();

  const where: Prisma.FlashSaleWhereInput = {
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    ...(query.phase === "upcoming" && { startsAt: { gt: now } }),
    ...(query.phase === "live" && {
      startsAt: { lte: now },
      endsAt: { gt: now },
    }),
    ...(query.phase === "ended" && { endsAt: { lte: now } }),
    ...(query.search && {
      title: { contains: query.search, mode: "insensitive" },
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.flashSale.findMany({
      where,
      orderBy: toPrismaOrderBy(query, SORTABLE, "startsAt"),
      include: { _count: { select: { rules: true, items: true } } },
      ...toPrismaPaging(query),
    }),
    prisma.flashSale.count({ where }),
  ]);

  return paginate(items, total, query);
};

export const getSaleById = async (id: string) => {
  const sale = await prisma.flashSale.findUnique({
    where: { id },
    include: {
      rules: {
        include: {
          category: { select: { id: true, name: true, slug: true } },
          product: { select: { id: true, name: true, slug: true } },
          variant: { select: { id: true, name: true, sku: true } },
        },
      },
      items: {
        include: {
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
              price: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  // Lets the admin UI resolve CATEGORY rules client-side and
                  // preview the exact flash price per row.
                  categoryId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!sale) {
    throw new ApiError(404, "Flash sale not found");
  }

  return sale;
};

export const createSale = (input: CreateFlashSaleInput): Promise<FlashSale> =>
  prisma.flashSale.create({ data: input });

export const updateSale = async (
  id: string,
  input: UpdateFlashSaleInput,
): Promise<FlashSale> => {
  const current = await ensureSale(id);

  // The schema-level refine only sees the fields sent; merge with the stored
  // pair so a lone startsAt cannot slide past the existing endsAt.
  const startsAt = input.startsAt ?? current.startsAt;
  const endsAt = input.endsAt ?? current.endsAt;

  if (endsAt <= startsAt) {
    throw new ApiError(400, "endsAt must be after startsAt");
  }

  return prisma.flashSale.update({ where: { id }, data: input });
};

export const deleteSale = async (id: string): Promise<void> => {
  await ensureSale(id);

  // Rules and items cascade.
  await prisma.flashSale.delete({ where: { id } });
};

/** Full replace, mirroring the category menu-products endpoint. */
export const setRules = async (id: string, input: SetRulesInput) => {
  await ensureSale(id);

  // Friendly 400s instead of FK violations: name what is missing.
  const wanted = {
    category: input.rules.flatMap((r) => (r.categoryId ? [r.categoryId] : [])),
    product: input.rules.flatMap((r) => (r.productId ? [r.productId] : [])),
    variant: input.rules.flatMap((r) => (r.variantId ? [r.variantId] : [])),
  };

  const [categories, products, variants] = await Promise.all([
    prisma.category.findMany({
      where: { id: { in: wanted.category } },
      select: { id: true },
    }),
    prisma.product.findMany({
      where: { id: { in: wanted.product } },
      select: { id: true },
    }),
    prisma.productVariant.findMany({
      where: { id: { in: wanted.variant } },
      select: { id: true },
    }),
  ]);

  const missing = [
    ...wanted.category.filter((x) => !categories.some((c) => c.id === x)),
    ...wanted.product.filter((x) => !products.some((p) => p.id === x)),
    ...wanted.variant.filter((x) => !variants.some((v) => v.id === x)),
  ];

  if (missing.length > 0) {
    throw new ApiError(400, `Rule targets not found: ${missing.join(", ")}`);
  }

  await prisma.$transaction([
    prisma.flashSaleRule.deleteMany({ where: { flashSaleId: id } }),
    prisma.flashSaleRule.createMany({
      data: input.rules.map((rule) => ({
        flashSaleId: id,
        scope: rule.scope,
        categoryId: rule.categoryId ?? null,
        productId: rule.productId ?? null,
        variantId: rule.variantId ?? null,
        discountType: rule.discountType,
        discountValue: rule.discountValue,
        maxDiscount: rule.maxDiscount ?? null,
      })),
    }),
  ]);

  return prisma.flashSaleRule.findMany({ where: { flashSaleId: id } });
};

/**
 * Replace the item list -- but by diff, not wipe-and-recreate: `soldCount`
 * lives on these rows, and editing a LIVE sale must not reset how many units
 * already sold at flash price.
 */
export const setItems = async (id: string, input: SetItemsInput) => {
  await ensureSale(id);

  const variantIds = input.items.map((i) => i.variantId);

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true },
  });

  if (variants.length !== variantIds.length) {
    const found = new Set(variants.map((v) => v.id));
    const missing = variantIds.filter((v) => !found.has(v));

    throw new ApiError(400, `Variants not found: ${missing.join(", ")}`);
  }

  const existing = await prisma.flashSaleItem.findMany({
    where: { flashSaleId: id },
    select: { variantId: true, soldCount: true },
  });

  const soldByVariant = new Map(
    existing.map((e) => [e.variantId, e.soldCount]),
  );

  // The DB CHECK would reject a cap below soldCount anyway, but with an error
  // naming a constraint instead of the fix.
  for (const item of input.items) {
    const sold = soldByVariant.get(item.variantId) ?? 0;

    if (item.quantityLimit != null && item.quantityLimit < sold) {
      throw new ApiError(
        400,
        `Quantity limit ${item.quantityLimit} is below the ${sold} already sold for variant ${item.variantId}`,
      );
    }
  }

  const incoming = new Set(variantIds);
  const kept = new Set(soldByVariant.keys());

  const toDelete = [...kept].filter((v) => !incoming.has(v));
  const toCreate = input.items.filter((i) => !kept.has(i.variantId));
  const toUpdate = input.items.filter((i) => kept.has(i.variantId));

  await prisma.$transaction([
    prisma.flashSaleItem.deleteMany({
      where: { flashSaleId: id, variantId: { in: toDelete } },
    }),
    prisma.flashSaleItem.createMany({
      data: toCreate.map((item) => ({
        flashSaleId: id,
        variantId: item.variantId,
        quantityLimit: item.quantityLimit ?? null,
      })),
    }),
    ...toUpdate.map((item) =>
      prisma.flashSaleItem.update({
        where: {
          flashSaleId_variantId: { flashSaleId: id, variantId: item.variantId },
        },
        data: { quantityLimit: item.quantityLimit ?? null },
      }),
    ),
  ]);

  return prisma.flashSaleItem.findMany({ where: { flashSaleId: id } });
};
