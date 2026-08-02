import { Coupon, Prisma, ProductStatus, SellerStatus } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { flashDealsForVariants, toNum } from "../flash-sale/flash-pricing";
import {
  paginate,
  Paginated,
  toPrismaOrderBy,
  toPrismaPaging,
} from "../../utils/pagination";
import {
  CreateCouponInput,
  ListCouponsQuery,
  UpdateCouponInput,
} from "./coupon.validation";

const round2 = (n: number): number => Math.round(n * 100) / 100;

const SORTABLE = [
  "createdAt",
  "name",
  "code",
  "startsAt",
  "expiresAt",
  "usedCount",
] as const;

const ensureCoupon = async (id: string): Promise<Coupon> => {
  const coupon = await prisma.coupon.findUnique({ where: { id } });

  if (!coupon) {
    throw new ApiError(404, "Coupon not found");
  }

  return coupon;
};

/** Friendly 400s instead of FK violations: name what is missing. */
const ensureTargets = async (categoryIds: string[], productIds: string[]) => {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true },
    }),
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    }),
  ]);

  const missing = [
    ...categoryIds.filter((x) => !categories.some((c) => c.id === x)),
    ...productIds.filter((x) => !products.some((p) => p.id === x)),
  ];

  if (missing.length > 0) {
    throw new ApiError(400, `Coupon targets not found: ${missing.join(", ")}`);
  }
};

export const listCoupons = async (
  query: ListCouponsQuery,
): Promise<
  Paginated<
    Coupon & { _count: { categories: number; products: number; redemptions: number } }
  >
> => {
  const now = new Date();

  const where: Prisma.CouponWhereInput = {
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    ...(query.discountType && { discountType: query.discountType }),
    ...(query.phase === "upcoming" && { startsAt: { gt: now } }),
    ...(query.phase === "live" && {
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    }),
    ...(query.phase === "ended" && { expiresAt: { lte: now } }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { code: { contains: query.search, mode: "insensitive" } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.coupon.findMany({
      where,
      orderBy: toPrismaOrderBy(query, SORTABLE, "createdAt"),
      include: {
        _count: {
          select: { categories: true, products: true, redemptions: true },
        },
      },
      ...toPrismaPaging(query),
    }),
    prisma.coupon.count({ where }),
  ]);

  return paginate(items, total, query);
};

export const getCouponById = async (id: string) => {
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: {
      categories: {
        include: { category: { select: { id: true, name: true, slug: true } } },
      },
      products: {
        include: { product: { select: { id: true, name: true, slug: true } } },
      },
      _count: { select: { redemptions: true } },
    },
  });

  if (!coupon) {
    throw new ApiError(404, "Coupon not found");
  }

  return coupon;
};

export const createCoupon = async (
  input: CreateCouponInput,
): Promise<Coupon> => {
  const { categoryIds = [], productIds = [], ...fields } = input;

  await ensureTargets(categoryIds, productIds);

  // A duplicate code surfaces as a 409 via the global P2002 handler.
  return prisma.coupon.create({
    data: {
      ...fields,
      // FREE_SHIPPING carries no amount, and maximumDiscount only caps a
      // percentage -- zero/null them so a later type switch reads clean data.
      discountValue:
        fields.discountType === "FREE_SHIPPING" ? 0 : fields.discountValue,
      maximumDiscount:
        fields.discountType === "PERCENTAGE"
          ? (fields.maximumDiscount ?? null)
          : null,
      categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      products: { create: productIds.map((productId) => ({ productId })) },
    },
  });
};

export const updateCoupon = async (
  id: string,
  input: UpdateCouponInput,
): Promise<Coupon> => {
  const current = await ensureCoupon(id);
  const { categoryIds, productIds, ...fields } = input;

  // The schema refines only see the fields sent; merge with the stored row so
  // a lone discountType flip cannot leave an out-of-range value behind.
  const discountType = fields.discountType ?? current.discountType;
  const discountValue = fields.discountValue ?? Number(current.discountValue);

  if (discountType !== "FREE_SHIPPING" && discountValue <= 0) {
    throw new ApiError(400, "Discount value must be above zero");
  }
  if (discountType === "PERCENTAGE" && discountValue > 100) {
    throw new ApiError(400, "Percentage discount cannot exceed 100");
  }

  const startsAt =
    fields.startsAt !== undefined ? fields.startsAt : current.startsAt;
  const expiresAt =
    fields.expiresAt !== undefined ? fields.expiresAt : current.expiresAt;

  if (startsAt && expiresAt && expiresAt <= startsAt) {
    throw new ApiError(400, "expiresAt must be after startsAt");
  }

  // The DB CHECK would reject this anyway, but with an error naming a
  // constraint instead of the fix.
  if (
    fields.totalUsageLimit != null &&
    fields.totalUsageLimit < current.usedCount
  ) {
    throw new ApiError(
      400,
      `Usage limit ${fields.totalUsageLimit} is below the ${current.usedCount} redemptions already recorded`,
    );
  }

  await ensureTargets(categoryIds ?? [], productIds ?? []);

  return prisma.coupon.update({
    where: { id },
    data: {
      ...fields,
      ...(discountType === "FREE_SHIPPING" && { discountValue: 0 }),
      ...(discountType !== "PERCENTAGE" && { maximumDiscount: null }),
      // Full replace, only when the caller sent the set (PATCH semantics).
      ...(categoryIds && {
        categories: {
          deleteMany: {},
          create: categoryIds.map((categoryId) => ({ categoryId })),
        },
      }),
      ...(productIds && {
        products: {
          deleteMany: {},
          create: productIds.map((productId) => ({ productId })),
        },
      }),
    },
  });
};

export const deleteCoupon = async (id: string): Promise<void> => {
  await ensureCoupon(id);

  // Attachments and redemptions cascade; orders keep their couponCode
  // snapshot, so provenance on past orders survives the delete.
  await prisma.coupon.delete({ where: { id } });
};

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/** One cart line as the coupon engine sees it — post-flash prices. */
export interface CouponCartLine {
  productId: string;
  categoryId: string;
  unitPrice: number;
  quantity: number;
  onFlashSale: boolean;
}

export interface CouponEvaluation {
  coupon: Coupon;
  /** ৳ off the goods; 0 for FREE_SHIPPING (the shipping charge zeroes instead). */
  discount: number;
  freeShipping: boolean;
}

/**
 * The single authority on whether `code` applies to this cart and for how
 * much — both the checkout preview and placeOrder defer to it, so the two
 * can never disagree. Rejections are 400s with the message the customer sees.
 */
export const evaluateCoupon = async (
  userId: string,
  code: string,
  lines: CouponCartLine[],
  subtotal: number,
): Promise<CouponEvaluation> => {
  const coupon = await prisma.coupon.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      categories: { select: { categoryId: true } },
      products: { select: { productId: true } },
    },
  });

  // Inactive reads the same as unknown on purpose — a disabled code should
  // not confirm its own existence.
  if (!coupon || !coupon.isActive) {
    throw new ApiError(400, "This coupon code is not valid");
  }

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) {
    throw new ApiError(400, "This coupon is not active yet");
  }
  if (coupon.expiresAt && now >= coupon.expiresAt) {
    throw new ApiError(400, "This coupon has expired");
  }
  if (
    coupon.totalUsageLimit !== null &&
    coupon.usedCount >= coupon.totalUsageLimit
  ) {
    throw new ApiError(400, "This coupon has been fully redeemed");
  }

  // Advisory here (a race-safe recount runs inside the order transaction).
  const usedByMe = await prisma.couponRedemption.count({
    where: { couponId: coupon.id, userId },
  });
  if (usedByMe >= coupon.perUserLimit) {
    throw new ApiError(400, "You have already used this coupon");
  }

  if (coupon.minimumOrderAmount !== null) {
    const minimum = toNum(coupon.minimumOrderAmount);
    if (subtotal < minimum) {
      throw new ApiError(
        400,
        `This coupon needs a minimum order of ৳${minimum.toFixed(0)} — add ৳${(
          minimum - subtotal
        ).toFixed(0)} more`,
      );
    }
  }

  // Scope: unattached = store-wide; otherwise a line qualifies through a
  // product attachment or a category attachment anywhere up its ancestry
  // (a coupon on "Women" must reach a product on the "Sarees" leaf).
  const wantedCategories = new Set(coupon.categories.map((c) => c.categoryId));
  const wantedProducts = new Set(coupon.products.map((p) => p.productId));

  let scoped = lines;
  if (wantedCategories.size > 0 || wantedProducts.size > 0) {
    let inScope: (categoryId: string) => boolean = () => false;
    if (wantedCategories.size > 0) {
      const categories = await prisma.category.findMany({
        select: { id: true, parentId: true },
      });
      const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
      inScope = (categoryId) => {
        const seen = new Set<string>();
        let cursor: string | null | undefined = categoryId;
        while (cursor && !seen.has(cursor)) {
          if (wantedCategories.has(cursor)) return true;
          seen.add(cursor);
          cursor = parentOf.get(cursor);
        }
        return false;
      };
    }

    scoped = lines.filter(
      (line) => wantedProducts.has(line.productId) || inScope(line.categoryId),
    );
    if (scoped.length === 0) {
      throw new ApiError(
        400,
        "This coupon does not apply to the items in your cart",
      );
    }
  }

  if (coupon.discountType === "FREE_SHIPPING") {
    // Shipping is not a goods price, so the flash-sale stacking rule does not
    // gate it — scope alone decides.
    return { coupon, discount: 0, freeShipping: true };
  }

  let eligible = scoped;
  if (!coupon.applyWithFlashSale) {
    eligible = scoped.filter((line) => !line.onFlashSale);
    if (eligible.length === 0) {
      throw new ApiError(
        400,
        "This coupon cannot be combined with flash-sale prices",
      );
    }
  }

  const eligibleSubtotal = round2(
    eligible.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
  );

  let discount =
    coupon.discountType === "PERCENTAGE"
      ? (eligibleSubtotal * toNum(coupon.discountValue)) / 100
      : toNum(coupon.discountValue);
  if (coupon.maximumDiscount !== null) {
    discount = Math.min(discount, toNum(coupon.maximumDiscount));
  }
  // A fixed ৳500 off a ৳300 eligible base takes off ৳300, not the order's
  // unrelated items.
  discount = round2(Math.min(discount, eligibleSubtotal));

  return { coupon, discount, freeShipping: false };
};

/**
 * Checkout preview: price the customer's own cart the way placeOrder will
 * and run the code against it. Lines the cart flags unavailable are skipped
 * rather than fatal — placeOrder rejects them regardless, and the preview
 * should judge the coupon, not the cart.
 */
export const previewCoupon = async (userId: string, code: string) => {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: {
      items: {
        select: {
          quantity: true,
          variant: {
            select: {
              id: true,
              price: true,
              stock: true,
              reservedStock: true,
              isActive: true,
              product: {
                select: {
                  id: true,
                  categoryId: true,
                  status: true,
                  sellerId: true,
                  seller: { select: { status: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, "Your cart is empty");
  }

  // Mirrors the availability predicate in order.service.placeOrder.
  const usable = cart.items.filter((item) => {
    const { variant } = item;
    const { product } = variant;
    const available = Math.max(0, variant.stock - variant.reservedStock);
    return (
      product.status === ProductStatus.ACTIVE &&
      (!product.sellerId || product.seller?.status === SellerStatus.APPROVED) &&
      variant.isActive &&
      available >= item.quantity
    );
  });

  if (usable.length === 0) {
    throw new ApiError(400, "Nothing in your cart is available to order");
  }

  const deals = await flashDealsForVariants(
    usable.map((item) => ({
      id: item.variant.id,
      productId: item.variant.product.id,
      categoryId: item.variant.product.categoryId,
      price: item.variant.price,
    })),
  );

  const lines: CouponCartLine[] = usable.map((item) => {
    const deal = deals.get(item.variant.id);
    return {
      productId: item.variant.product.id,
      categoryId: item.variant.product.categoryId,
      unitPrice: deal ? Number(deal.flashPrice) : toNum(item.variant.price),
      quantity: item.quantity,
      onFlashSale: Boolean(deal),
    };
  });

  const subtotal = round2(
    lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
  );

  const result = await evaluateCoupon(userId, code, lines, subtotal);

  return {
    code: result.coupon.code,
    name: result.coupon.name,
    discountType: result.coupon.discountType,
    discountValue: result.coupon.discountValue,
    discount: result.discount.toFixed(2),
    freeShipping: result.freeShipping,
  };
};
