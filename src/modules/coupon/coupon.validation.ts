import { z } from "zod";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

export const couponIdSchema = z.object({ params: idParam });

// Codes are stored uppercase so lookup at checkout can be case-insensitive
// without a functional index.
const codeField = z
  .string()
  .trim()
  .min(3, "Code must be at least 3 characters")
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, dashes and underscores only")
  .transform((v) => v.toUpperCase());

const couponFields = {
  description: z.string().trim().max(1000).nullable().optional(),
  // discountValue is ignored for FREE_SHIPPING (schema.prisma) -- the service
  // zeroes it so a stale amount cannot linger behind a type switch.
  discountValue: z.coerce.number().min(0).default(0),
  minimumOrderAmount: z.coerce.number().positive().nullable().optional(),
  // Caps a PERCENTAGE discount in absolute taka; meaningless for the rest.
  maximumDiscount: z.coerce.number().positive().nullable().optional(),
  totalUsageLimit: z.coerce.number().int().positive().nullable().optional(),
  perUserLimit: z.coerce.number().int().positive().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
  applyWithFlashSale: z.boolean().optional(),
  // Full-replace attachment sets. Neither attached = store-wide coupon.
  categoryIds: z.array(z.string().min(1)).max(100).optional(),
  productIds: z.array(z.string().min(1)).max(200).optional(),
};

const noDuplicates = (ids: string[] | undefined) =>
  !ids || new Set(ids).size === ids.length;

export const createCouponSchema = z.object({
  body: z
    .object({
      ...couponFields,
      name: z.string().trim().min(2, "Name must be at least 2 characters").max(160),
      code: codeField,
      discountType: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING"]),
    })
    .refine(
      (v) => v.discountType === "FREE_SHIPPING" || v.discountValue > 0,
      { message: "Discount value must be above zero", path: ["discountValue"] },
    )
    .refine(
      (v) => v.discountType !== "PERCENTAGE" || v.discountValue <= 100,
      { message: "Percentage discount cannot exceed 100", path: ["discountValue"] },
    )
    .refine(
      (v) => !v.startsAt || !v.expiresAt || v.expiresAt > v.startsAt,
      { message: "expiresAt must be after startsAt", path: ["expiresAt"] },
    )
    .refine((v) => noDuplicates(v.categoryIds), {
      message: "Duplicate category ids",
      path: ["categoryIds"],
    })
    .refine((v) => noDuplicates(v.productIds), {
      message: "Duplicate product ids",
      path: ["productIds"],
    }),
});

// Cross-field pairs (type/value, window, usage floor) are re-validated in the
// service against the stored row -- a partial PATCH cannot be checked here.
export const updateCouponSchema = z.object({
  params: idParam,
  body: z
    .object({
      ...couponFields,
      discountValue: z.coerce.number().min(0).optional(),
      name: z.string().trim().min(2).max(160).optional(),
      code: codeField.optional(),
      discountType: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING"]).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "Nothing to update")
    .refine(
      (v) => !v.startsAt || !v.expiresAt || v.expiresAt > v.startsAt,
      { message: "expiresAt must be after startsAt", path: ["expiresAt"] },
    )
    .refine((v) => noDuplicates(v.categoryIds), {
      message: "Duplicate category ids",
      path: ["categoryIds"],
    })
    .refine((v) => noDuplicates(v.productIds), {
      message: "Duplicate product ids",
      path: ["productIds"],
    }),
});

export const previewCouponSchema = z.object({
  body: z.object({
    code: z.string().trim().min(1, "Enter a coupon code").max(40),
  }),
});

export const listCouponsSchema = z.object({
  query: paginationQuery.extend({
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    discountType: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING"]).optional(),
    // Convenience filter on the validity window relative to now. A null
    // boundary is open-ended: never "upcoming", never "ended".
    phase: z.enum(["upcoming", "live", "ended"]).optional(),
  }),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>["body"];
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>["body"];
export type ListCouponsQuery = z.infer<typeof listCouponsSchema>["query"];
