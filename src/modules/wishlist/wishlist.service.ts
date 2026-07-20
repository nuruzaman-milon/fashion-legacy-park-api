import { Prisma, ProductStatus, SellerStatus } from "@prisma/client";
import { z } from "zod";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { paginate, Paginated, toPrismaPaging } from "../../utils/pagination";
import { paginationQuery } from "../../utils/pagination";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const addToWishlistSchema = z.object({
  body: z.object({
    productId: z.string().min(1, "Product is required"),
  }),
});

export const productIdParamSchema = z.object({
  params: z.object({ productId: z.string().min(1) }),
});

/**
 * The wishlist is product-level but the cart is variant-level, so moving one
 * across needs the customer to pick a variant. There is no safe default: the
 * cheapest or first variant is a guess about size or colour.
 */
export const moveToCartSchema = z.object({
  params: z.object({ productId: z.string().min(1) }),
  body: z.object({
    variantId: z.string().min(1, "Choose a variant to add to the cart"),
    quantity: z.coerce.number().int().min(1).max(99).default(1),
  }),
});

export const listWishlistSchema = z.object({ query: paginationQuery });

export type ListWishlistQuery = z.infer<typeof listWishlistSchema>["query"];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const wishlistInclude = {
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      minPrice: true,
      maxPrice: true,
      totalStock: true,
      avgRating: true,
      reviewCount: true,
      sellerId: true,
      seller: { select: { status: true } },
      category: { select: { id: true, name: true, slug: true } },
      brand: { select: { id: true, name: true, slug: true } },
      images: {
        where: { isPrimary: true },
        take: 1,
        select: { url: true, alt: true },
      },
    },
  },
} satisfies Prisma.WishlistInclude;

export const listWishlist = async (
  userId: string,
  query: ListWishlistQuery,
): Promise<Paginated<unknown>> => {
  const [items, total] = await prisma.$transaction([
    prisma.wishlist.findMany({
      where: { userId },
      include: wishlistInclude,
      orderBy: { createdAt: "desc" },
      ...toPrismaPaging(query),
    }),
    prisma.wishlist.count({ where: { userId } }),
  ]);

  // A wishlisted product that has been withdrawn stays in the list, flagged.
  // Silently dropping it would leave the customer wondering where it went --
  // same reasoning as the cart.
  const mapped = items.map(({ product, ...entry }) => {
    const { sellerId, seller, ...rest } = product;

    const purchasable =
      product.status === ProductStatus.ACTIVE &&
      (!sellerId || seller?.status === SellerStatus.APPROVED);

    return {
      ...entry,
      product: rest,
      isPurchasable: purchasable,
      isInStock: product.totalStock > 0,
    };
  });

  return paginate(mapped, total, query);
};

export const addToWishlist = async (userId: string, productId: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  // Idempotent: wishlisting twice is a no-op rather than a 409. Clicking a
  // heart icon twice is a normal thing to do, not an error.
  await prisma.wishlist.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: {},
  });

  return prisma.wishlist.findUnique({
    where: { userId_productId: { userId, productId } },
    include: wishlistInclude,
  });
};

export const removeFromWishlist = async (
  userId: string,
  productId: string,
): Promise<void> => {
  const result = await prisma.wishlist.deleteMany({
    where: { userId, productId },
  });

  if (result.count === 0) {
    throw new ApiError(404, "Not in your wishlist");
  }
};

/** Convenience for a heart toggle: returns the resulting state. */
export const toggleWishlist = async (
  userId: string,
  productId: string,
): Promise<{ wishlisted: boolean }> => {
  const existing = await prisma.wishlist.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.wishlist.delete({ where: { id: existing.id } });
    return { wishlisted: false };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  await prisma.wishlist.create({ data: { userId, productId } });

  return { wishlisted: true };
};

/**
 * Verifies the chosen variant actually belongs to the wishlisted product before
 * handing off to the cart -- otherwise a crafted request could add any variant
 * in the catalogue through this route.
 */
export const assertVariantBelongsToProduct = async (
  productId: string,
  variantId: string,
): Promise<void> => {
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, productId },
    select: { id: true },
  });

  if (!variant) {
    throw new ApiError(400, "That variant does not belong to this product");
  }
};

export const removeAfterMove = (userId: string, productId: string) =>
  prisma.wishlist.deleteMany({ where: { userId, productId } });
