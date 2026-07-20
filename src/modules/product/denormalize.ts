import { Prisma, ProductStatus, ReviewStatus } from "@prisma/client";
import prisma from "../../lib/prisma";

/**
 * Recalculates the denormalised columns on Product.
 *
 * WHY THESE EXIST: price and stock live on ProductVariant, and ratings live on
 * Review. Computing them per request would mean aggregating on every listing
 * query, which makes price-range filters and rating/best-seller sorts
 * unindexable -- you would have to sort in application memory after fetching
 * the whole result set, which stops working at a few hundred products.
 *
 * WHY IT IS ONE FUNCTION: these values have no database-level guarantee. Every
 * write that touches a variant's price, stock or isActive flag, or a review's
 * status, must call this. Scattering the arithmetic through controllers is how
 * listings silently go stale -- one forgotten call and a product shows the wrong
 * price on the category page indefinitely, with nothing failing.
 *
 * Call it with the surrounding transaction client wherever one exists, so the
 * aggregates commit or roll back together with the change that caused them.
 */
export const recalcProductAggregates = async (
  productId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> => {
  // Only ACTIVE variants count. An inactive one must not set the price shown on
  // the listing, nor contribute stock a customer cannot actually buy.
  const priceStock = await client.productVariant.aggregate({
    where: { productId, isActive: true },
    _min: { price: true },
    _max: { price: true },
    _sum: { stock: true },
  });

  // Only APPROVED reviews. Counting PENDING ones would let an unmoderated
  // 1-star review move the public average before anyone has seen it.
  const rating = await client.review.aggregate({
    where: { productId, status: ReviewStatus.APPROVED },
    _avg: { rating: true },
    _count: { _all: true },
  });

  await client.product.update({
    where: { id: productId },
    data: {
      minPrice: priceStock._min.price,
      maxPrice: priceStock._max.price,
      totalStock: priceStock._sum.stock ?? 0,
      // Round to one decimal: a raw 4.333333 average is noise in a star rating
      // and makes equality comparisons in tests and caches fragile.
      avgRating: rating._avg.rating
        ? Math.round(rating._avg.rating * 10) / 10
        : 0,
      reviewCount: rating._count._all,
    },
  });
};

/**
 * Flips a product to OUT_OF_STOCK when every variant is sold out, and back to
 * ACTIVE when stock returns.
 *
 * Deliberately narrow: it only ever moves between those two states. Touching a
 * DRAFT, PENDING_APPROVAL or REJECTED product here would publish something that
 * was never approved, purely because someone restocked it.
 */
export const syncStockStatus = async (
  productId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> => {
  const product = await client.product.findUnique({
    where: { id: productId },
    select: { status: true, totalStock: true },
  });

  if (!product) return;

  if (
    product.status === ProductStatus.ACTIVE &&
    product.totalStock <= 0
  ) {
    await client.product.update({
      where: { id: productId },
      data: { status: ProductStatus.OUT_OF_STOCK },
    });
    return;
  }

  if (
    product.status === ProductStatus.OUT_OF_STOCK &&
    product.totalStock > 0
  ) {
    await client.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ACTIVE },
    });
  }
};

/** Recalculate then re-evaluate stock status, in that order. */
export const refreshProduct = async (
  productId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> => {
  await recalcProductAggregates(productId, client);
  await syncStockStatus(productId, client);
};
