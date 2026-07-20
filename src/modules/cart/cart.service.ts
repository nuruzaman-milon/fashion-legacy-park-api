import { Prisma, ProductStatus, SellerStatus } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { AddToCartInput } from "./cart.validation";

/**
 * Why a line cannot currently be bought. Returned to the client rather than
 * silently dropping the item, so the customer can see what changed instead of
 * wondering where their selection went.
 */
export type UnavailableReason =
  | "PRODUCT_UNAVAILABLE"
  | "SELLER_UNAVAILABLE"
  | "VARIANT_INACTIVE"
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_STOCK";

const cartItemInclude = {
  variant: {
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      comparePrice: true,
      stock: true,
      reservedStock: true,
      isActive: true,
      weight: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          sellerId: true,
          seller: { select: { status: true } },
          images: {
            where: { isPrimary: true },
            take: 1,
            select: { url: true, alt: true },
          },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartItemWithVariant = Prisma.CartItemGetPayload<{
  include: typeof cartItemInclude;
}>;

/**
 * Availability is computed at read time, never stored.
 *
 * Stock, prices and product status all move independently of the cart, so a
 * cached flag would be wrong within seconds. Deriving it on read is cheap and
 * always correct.
 */
const evaluate = (item: CartItemWithVariant) => {
  const { variant } = item;
  const { product } = variant;

  // Reserved units belong to other customers mid-checkout. Nothing reserves
  // today, but reading `available` here means the order module can start
  // reserving without the cart needing a change.
  const available = Math.max(0, variant.stock - variant.reservedStock);

  let reason: UnavailableReason | null = null;

  if (product.status !== ProductStatus.ACTIVE) {
    reason = "PRODUCT_UNAVAILABLE";
  } else if (product.sellerId && product.seller?.status !== SellerStatus.APPROVED) {
    // Suspending a supplier has to stop their goods being bought, not just
    // hide them from browse.
    reason = "SELLER_UNAVAILABLE";
  } else if (!variant.isActive) {
    reason = "VARIANT_INACTIVE";
  } else if (available === 0) {
    reason = "OUT_OF_STOCK";
  } else if (available < item.quantity) {
    reason = "INSUFFICIENT_STOCK";
  }

  const unitPrice = variant.price;
  const lineTotal = unitPrice.mul(item.quantity);

  const addedPrice = item.addedPrice;
  const priceChanged = addedPrice !== null && !addedPrice.equals(unitPrice);

  return {
    id: item.id,
    quantity: item.quantity,
    unitPrice,
    lineTotal,
    isAvailable: reason === null,
    unavailableReason: reason,
    // Lets the client clamp its quantity stepper instead of guessing.
    maxQuantity: available,
    priceChanged,
    addedPrice,
    priceDropped: priceChanged && addedPrice!.greaterThan(unitPrice),
    variant: {
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      comparePrice: variant.comparePrice,
      weight: variant.weight,
      available,
    },
    product: {
      id: product.id,
      name: product.name,
      slug: product.slug,
      image: product.images[0]?.url ?? null,
    },
    createdAt: item.createdAt,
  };
};

const buildCart = (cartId: string, items: CartItemWithVariant[]) => {
  const evaluated = items.map(evaluate);

  // Only sellable lines count toward the total, so the figure always matches
  // what checkout would actually charge.
  const subtotal = evaluated
    .filter((i) => i.isAvailable)
    .reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0));

  const unavailableCount = evaluated.filter((i) => !i.isAvailable).length;

  return {
    id: cartId,
    items: evaluated,
    summary: {
      itemCount: evaluated.length,
      totalQuantity: evaluated.reduce((n, i) => n + i.quantity, 0),
      subtotal,
      unavailableCount,
      hasUnavailableItems: unavailableCount > 0,
    },
  };
};

/**
 * Every customer has exactly one cart, created on first touch.
 *
 * Cart.userId is unique, so a plain create would race two concurrent requests
 * into a constraint violation. upsert makes first access idempotent.
 */
const getOrCreateCart = async (userId: string): Promise<string> => {
  const cart = await prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });

  return cart.id;
};

const loadCart = async (cartId: string) => {
  const items = await prisma.cartItem.findMany({
    where: { cartId },
    include: cartItemInclude,
    orderBy: { createdAt: "desc" },
  });

  return buildCart(cartId, items);
};

export const getCart = async (userId: string) => {
  const cartId = await getOrCreateCart(userId);
  return loadCart(cartId);
};

export const addItem = async (userId: string, input: AddToCartInput) => {
  const variant = await prisma.productVariant.findUnique({
    where: { id: input.variantId },
    select: {
      id: true,
      price: true,
      stock: true,
      reservedStock: true,
      isActive: true,
      product: {
        select: {
          status: true,
          sellerId: true,
          seller: { select: { status: true } },
        },
      },
    },
  });

  if (!variant) {
    throw new ApiError(404, "Product variant not found");
  }

  // Adding is blocked outright, unlike an item that goes bad while sitting in
  // the cart -- there is no reason to let a customer add something unbuyable.
  if (variant.product.status !== ProductStatus.ACTIVE) {
    throw new ApiError(400, "This product is not available for purchase");
  }

  if (
    variant.product.sellerId &&
    variant.product.seller?.status !== SellerStatus.APPROVED
  ) {
    throw new ApiError(400, "This product is not available for purchase");
  }

  if (!variant.isActive) {
    throw new ApiError(400, "This option is no longer available");
  }

  const available = Math.max(0, variant.stock - variant.reservedStock);

  if (available === 0) {
    throw new ApiError(400, "This item is out of stock");
  }

  const cartId = await getOrCreateCart(userId);

  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId, variantId: input.variantId } },
    select: { id: true, quantity: true },
  });

  // Adding the same variant twice tops up the existing line. A unique
  // constraint on (cartId, variantId) would otherwise reject the second add.
  const nextQuantity = (existing?.quantity ?? 0) + input.quantity;

  if (nextQuantity > available) {
    throw new ApiError(
      400,
      existing
        ? `Only ${available} left; you already have ${existing.quantity} in your cart`
        : `Only ${available} left in stock`,
    );
  }

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: nextQuantity },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId,
        variantId: input.variantId,
        quantity: input.quantity,
        // Snapshot for price-change detection only; the cart still charges
        // whatever the variant costs at checkout time.
        addedPrice: variant.price,
      },
    });
  }

  return loadCart(cartId);
};

/** Scoped by userId so one customer cannot touch another's line by id. */
const findOwnedItem = async (userId: string, itemId: string) => {
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cart: { userId } },
    select: {
      id: true,
      cartId: true,
      variantId: true,
      variant: { select: { stock: true, reservedStock: true } },
    },
  });

  if (!item) {
    // 404 rather than 403: ids must not be probeable for existence.
    throw new ApiError(404, "Cart item not found");
  }

  return item;
};

export const updateItem = async (
  userId: string,
  itemId: string,
  quantity: number,
) => {
  const item = await findOwnedItem(userId, itemId);

  const available = Math.max(
    0,
    item.variant.stock - item.variant.reservedStock,
  );

  if (quantity > available) {
    throw new ApiError(400, `Only ${available} left in stock`);
  }

  await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  });

  return loadCart(item.cartId);
};

export const removeItem = async (userId: string, itemId: string) => {
  const item = await findOwnedItem(userId, itemId);

  await prisma.cartItem.delete({ where: { id: itemId } });

  return loadCart(item.cartId);
};

export const clearCart = async (userId: string) => {
  const cartId = await getOrCreateCart(userId);

  await prisma.cartItem.deleteMany({ where: { cartId } });

  return loadCart(cartId);
};

/** Removes every line that cannot currently be bought, in one action. */
export const removeUnavailable = async (userId: string) => {
  const cartId = await getOrCreateCart(userId);

  const items = await prisma.cartItem.findMany({
    where: { cartId },
    include: cartItemInclude,
  });

  const doomed = items.filter((item) => !evaluate(item).isAvailable);

  if (doomed.length > 0) {
    await prisma.cartItem.deleteMany({
      where: { id: { in: doomed.map((i) => i.id) } },
    });
  }

  return { removed: doomed.length, cart: await loadCart(cartId) };
};

/** Moves a line into the wishlist: saved for later without holding the cart. */
export const moveToWishlist = async (userId: string, itemId: string) => {
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cart: { userId } },
    select: {
      id: true,
      cartId: true,
      variant: { select: { productId: true } },
    },
  });

  if (!item) {
    throw new ApiError(404, "Cart item not found");
  }

  await prisma.$transaction([
    // Wishlist is product-level, so the same product from two variants
    // collapses to one entry -- skipDuplicates avoids a unique violation.
    prisma.wishlist.createMany({
      data: [{ userId, productId: item.variant.productId }],
      skipDuplicates: true,
    }),
    prisma.cartItem.delete({ where: { id: itemId } }),
  ]);

  return loadCart(item.cartId);
};
