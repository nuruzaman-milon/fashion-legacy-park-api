import { z } from "zod";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

export const flashSaleIdSchema = z.object({ params: idParam });

const saleFields = {
  description: z.string().trim().max(1000).nullable().optional(),
  banner: z.url().nullable().optional(),
  isActive: z.boolean().optional(),
};

export const createFlashSaleSchema = z.object({
  body: z
    .object({
      ...saleFields,
      title: z.string().trim().min(2, "Title must be at least 2 characters").max(160),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
    })
    .refine((v) => v.endsAt > v.startsAt, {
      message: "endsAt must be after startsAt",
      path: ["endsAt"],
    }),
});

// When only one boundary is sent, the service re-validates against the stored
// other half -- the pair cannot be checked here.
export const updateFlashSaleSchema = z.object({
  params: idParam,
  body: z
    .object({
      ...saleFields,
      title: z.string().trim().min(2).max(160).optional(),
      startsAt: z.coerce.date().optional(),
      endsAt: z.coerce.date().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "Nothing to update")
    .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, {
      message: "endsAt must be after startsAt",
      path: ["endsAt"],
    }),
});

export const listFlashSalesSchema = z.object({
  query: paginationQuery.extend({
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    // Convenience filter on the sale window relative to now.
    phase: z.enum(["upcoming", "live", "ended"]).optional(),
  }),
});

// FREE_SHIPPING is deliberately absent: it is a coupon concept, a flash sale
// discounts the price of goods.
const ruleInput = z
  .object({
    scope: z.enum(["CATEGORY", "PRODUCT", "VARIANT"]),
    categoryId: z.string().min(1).optional(),
    productId: z.string().min(1).optional(),
    variantId: z.string().min(1).optional(),
    discountType: z.enum(["PERCENTAGE", "FIXED"]),
    discountValue: z.coerce.number().positive(),
    maxDiscount: z.coerce.number().positive().nullable().optional(),
  })
  .refine(
    (r) => {
      const targets = [r.categoryId, r.productId, r.variantId].filter(Boolean);
      const scopeTarget = {
        CATEGORY: r.categoryId,
        PRODUCT: r.productId,
        VARIANT: r.variantId,
      }[r.scope];

      return targets.length === 1 && scopeTarget !== undefined;
    },
    { message: "Exactly one target matching the scope must be set" },
  )
  .refine((r) => r.discountType !== "PERCENTAGE" || r.discountValue <= 100, {
    message: "Percentage discount cannot exceed 100",
    path: ["discountValue"],
  });

export const setRulesSchema = z.object({
  params: idParam,
  body: z.object({
    rules: z.array(ruleInput).max(100),
  }),
});

const itemInput = z.object({
  variantId: z.string().min(1),
  quantityLimit: z.coerce.number().int().positive().nullable().optional(),
});

export const setItemsSchema = z.object({
  params: idParam,
  body: z.object({
    items: z
      .array(itemInput)
      .max(500)
      .refine(
        (items) =>
          new Set(items.map((i) => i.variantId)).size === items.length,
        "Duplicate variant ids",
      ),
  }),
});

export type CreateFlashSaleInput = z.infer<typeof createFlashSaleSchema>["body"];
export type UpdateFlashSaleInput = z.infer<typeof updateFlashSaleSchema>["body"];
export type ListFlashSalesQuery = z.infer<typeof listFlashSalesSchema>["query"];
export type SetRulesInput = z.infer<typeof setRulesSchema>["body"];
export type SetItemsInput = z.infer<typeof setItemsSchema>["body"];
