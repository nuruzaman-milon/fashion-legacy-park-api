import { OrderStatus, Prisma, ReviewStatus } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { notifyAdmins } from "../notification/notification.service";
import { recalcProductAggregates } from "../product/denormalize";
import {
  paginate,
  Paginated,
  toPrismaPaging,
} from "../../utils/pagination";
import {
  AdminListReviewsQuery,
  CreateReviewInput,
} from "./review.validation";

/**
 * Written against a DELIVERED order line the caller owns. Everything a
 * review claims — who bought, what they bought, that they received it — is
 * proven here rather than trusted from the client.
 */
export const createReview = async (
  userId: string,
  input: CreateReviewInput,
) => {
  const orderItem = await prisma.orderItem.findUnique({
    where: { id: input.orderItemId },
    select: {
      id: true,
      productId: true,
      title: true,
      order: { select: { userId: true, orderStatus: true } },
      review: { select: { id: true } },
    },
  });

  // 404 for both "not yours" and "doesn't exist": line ids must not be
  // probeable for existence.
  if (!orderItem || orderItem.order.userId !== userId) {
    throw new ApiError(404, "Order item not found");
  }

  if (orderItem.order.orderStatus !== OrderStatus.DELIVERED) {
    throw new ApiError(400, "You can review an item once it has been delivered");
  }

  if (orderItem.review) {
    throw new ApiError(409, "You have already reviewed this item");
  }

  if (!orderItem.productId) {
    throw new ApiError(400, "This product no longer exists");
  }

  // PENDING by default — the moderation queue publishes it, so nothing a
  // customer writes reaches product pages unseen.
  return prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        userId,
        productId: orderItem.productId!,
        orderItemId: orderItem.id,
        rating: input.rating,
        comment: input.comment,
        isVerifiedPurchase: true,
      },
      select: { id: true, rating: true, comment: true, status: true },
    });

    await notifyAdmins(tx, {
      type: "SYSTEM",
      title: "New review awaiting moderation",
      message: `${input.rating}★ on ${orderItem.title}`,
      link: "/admin/reviews",
    });

    return review;
  });
};

// ---------------------------------------------------------------------------
// Admin moderation
// ---------------------------------------------------------------------------

const adminReviewSelect = {
  id: true,
  rating: true,
  comment: true,
  images: true,
  status: true,
  isVerifiedPurchase: true,
  adminReply: true,
  adminReplyAt: true,
  helpfulCount: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  product: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ReviewSelect;

export const adminListReviews = async (
  query: AdminListReviewsQuery,
): Promise<Paginated<unknown>> => {
  const where: Prisma.ReviewWhereInput = {
    ...(query.status && { status: query.status }),
    ...(query.rating && { rating: query.rating }),
    ...(query.search && {
      OR: [
        { comment: { contains: query.search, mode: "insensitive" } },
        { product: { name: { contains: query.search, mode: "insensitive" } } },
        { user: { email: { contains: query.search, mode: "insensitive" } } },
        { user: { name: { contains: query.search, mode: "insensitive" } } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.review.findMany({
      where,
      select: adminReviewSelect,
      orderBy: { createdAt: "desc" },
      ...toPrismaPaging(query),
    }),
    prisma.review.count({ where }),
  ]);

  return paginate(items, total, query);
};

const ensureReview = async (id: string) => {
  const review = await prisma.review.findUnique({
    where: { id },
    select: { id: true, productId: true, status: true },
  });

  if (!review) {
    throw new ApiError(404, "Review not found");
  }

  return review;
};

/**
 * Publish or reject. The product's avgRating/reviewCount aggregate only
 * APPROVED reviews, so every status move recalculates them in the same
 * transaction (FEATURE.md §11 warning).
 */
export const setReviewStatus = async (id: string, status: ReviewStatus) => {
  const review = await ensureReview(id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.review.update({
      where: { id },
      data: { status },
      select: adminReviewSelect,
    });

    await recalcProductAggregates(review.productId, tx);

    return updated;
  });
};

export const replyToReview = async (id: string, reply: string) => {
  await ensureReview(id);

  return prisma.review.update({
    where: { id },
    data: { adminReply: reply, adminReplyAt: new Date() },
    select: adminReviewSelect,
  });
};

export const deleteReview = async (id: string): Promise<void> => {
  const review = await ensureReview(id);

  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id } });
    // Only published reviews count, but recalc unconditionally — it is
    // cheap and cannot drift.
    await recalcProductAggregates(review.productId, tx);
  });
};
