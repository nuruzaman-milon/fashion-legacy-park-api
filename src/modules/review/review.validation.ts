import { z } from "zod";
import { ReviewStatus } from "@prisma/client";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

export const reviewIdSchema = z.object({ params: idParam });

/**
 * A review is written against a purchased line, not a product — the
 * orderItemId is what makes it a verified purchase and what allows a second
 * review after a re-purchase.
 */
export const createReviewSchema = z.object({
  body: z.object({
    orderItemId: z.string().min(1),
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).optional(),
  }),
});

export const adminListReviewsSchema = z.object({
  query: paginationQuery.extend({
    status: z.enum(ReviewStatus).optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
  }),
});

export const setReviewStatusSchema = z.object({
  params: idParam,
  body: z.object({
    status: z.enum([ReviewStatus.APPROVED, ReviewStatus.REJECTED]),
  }),
});

export const replySchema = z.object({
  params: idParam,
  body: z.object({
    reply: z.string().trim().min(1, "Write the reply").max(1000),
  }),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>["body"];
export type AdminListReviewsQuery = z.infer<
  typeof adminListReviewsSchema
>["query"];
