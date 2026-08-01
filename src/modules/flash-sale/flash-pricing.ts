import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";

/**
 * Flash-sale price resolution shared by every surface that shows a price:
 * the homepage sale section, the product detail page and the cart. One
 * resolver, so a variant can never cost one thing in the sale rail and
 * another in the cart.
 *
 * Kept free of imports from other modules -- browse and cart both import
 * this, and flash-sale.service imports browse; a resolver living in
 * flash-sale.service would close that cycle.
 */

// Money math in plain numbers: Decimal(10,2) fits a double exactly enough for
// display pricing. The authoritative charge at checkout must re-resolve.
export const toNum = (d: Prisma.Decimal | number): number => Number(d);

const round2 = (n: number): number => Math.round(n * 100) / 100;

export type RuleForPricing = {
  discountType: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
  discountValue: Prisma.Decimal;
  maxDiscount: Prisma.Decimal | null;
};

export const applyRule = (price: number, rule: RuleForPricing): number => {
  let discount =
    rule.discountType === "PERCENTAGE"
      ? (price * toNum(rule.discountValue)) / 100
      : toNum(rule.discountValue);

  if (rule.maxDiscount !== null) {
    discount = Math.min(discount, toNum(rule.maxDiscount));
  }

  return round2(Math.max(0, price - discount));
};

export interface FlashDeal {
  saleId: string;
  title: string;
  endsAt: Date;
  flashPrice: string;
  quantityLimit: number | null;
  soldCount: number;
  remaining: number | null;
}

/**
 * The live sale's price for each given variant. A variant is only in the map
 * when all three hold: it is a sale ITEM, some RULE prices it (precedence
 * VARIANT > PRODUCT > CATEGORY, lowest price within the tier), and its cap
 * is not sold out -- an exhausted cap means the variant sells at full price
 * again, so callers can treat "absent" as "no deal".
 */
export const flashDealsForVariants = async (
  variants: {
    id: string;
    productId: string;
    categoryId: string;
    price: Prisma.Decimal | number;
  }[],
): Promise<Map<string, FlashDeal>> => {
  const deals = new Map<string, FlashDeal>();
  if (variants.length === 0) return deals;

  const now = new Date();

  // Same selection as the public /flash-sales/active endpoint: the most
  // recently started live sale wins, createdAt as the final tiebreak.
  const sale = await prisma.flashSale.findFirst({
    where: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
  });
  if (!sale) return deals;

  const [rules, items] = await Promise.all([
    prisma.flashSaleRule.findMany({ where: { flashSaleId: sale.id } }),
    prisma.flashSaleItem.findMany({
      where: {
        flashSaleId: sale.id,
        variantId: { in: variants.map((v) => v.id) },
      },
      select: { variantId: true, quantityLimit: true, soldCount: true },
    }),
  ]);
  if (rules.length === 0 || items.length === 0) return deals;

  const variantRules = rules.filter((r) => r.scope === "VARIANT");
  const productRules = rules.filter((r) => r.scope === "PRODUCT");
  const categoryRules = rules.filter((r) => r.scope === "CATEGORY");

  // A rule on "Women" must reach a product on the "Tops" leaf, so category
  // matching walks the ancestor chain. Only paid for when category rules
  // exist at all.
  const parentOf = new Map<string, string | null>(
    categoryRules.length > 0
      ? (
          await prisma.category.findMany({
            select: { id: true, parentId: true },
          })
        ).map((c) => [c.id, c.parentId])
      : [],
  );

  const ancestry = (categoryId: string): Set<string> => {
    const seen = new Set<string>();
    let cursor: string | null | undefined = categoryId;

    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }

    return seen;
  };

  const itemByVariant = new Map(items.map((i) => [i.variantId, i]));

  for (const variant of variants) {
    const item = itemByVariant.get(variant.id);
    if (!item) continue;

    const remaining =
      item.quantityLimit === null
        ? null
        : Math.max(0, item.quantityLimit - item.soldCount);
    if (remaining === 0) continue;

    const lineage = ancestry(variant.categoryId);
    const tiers = [
      variantRules.filter((r) => r.variantId === variant.id),
      productRules.filter((r) => r.productId === variant.productId),
      categoryRules.filter((r) => r.categoryId && lineage.has(r.categoryId)),
    ];
    const matched = tiers.find((tier) => tier.length > 0);
    if (!matched) continue;

    const price = toNum(variant.price);
    const flashPrice = Math.min(...matched.map((r) => applyRule(price, r)));

    deals.set(variant.id, {
      saleId: sale.id,
      title: sale.title,
      endsAt: sale.endsAt,
      flashPrice: flashPrice.toFixed(2),
      quantityLimit: item.quantityLimit,
      soldCount: item.soldCount,
      remaining,
    });
  }

  return deals;
};
