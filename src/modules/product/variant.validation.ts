import { z } from "zod";

const idParam = z.object({ id: z.string().min(1) });

export const attachOptionsSchema = z.object({
  params: idParam,
  body: z.object({
    options: z
      .array(
        z.object({
          optionId: z.string().min(1),
          sortOrder: z.coerce.number().int().min(0).default(0),
        }),
      )
      .min(1, "Select at least one option")
      // Two dimensions covers Colour x Size; a third is already 100+ rows.
      .max(3, "A product can use at most 3 options"),
  }),
});

/**
 * Matrix generation. Picking Color=[Red,Blue] and Size=[S,M,L] creates all six
 * combinations in one call rather than six separate requests.
 */
export const generateVariantsSchema = z.object({
  params: idParam,
  body: z.object({
    selections: z
      .array(
        z.object({
          optionId: z.string().min(1),
          valueIds: z.array(z.string().min(1)).min(1, "Pick at least one value"),
        }),
      )
      .min(1)
      .max(3),
    // Applied to every generated variant; edit individually or in bulk after.
    price: z.coerce.number().min(0).default(0),
    stock: z.coerce.number().int().min(0).default(0),
    // Prefix for generated SKUs, e.g. KURTI -> KURTI-RED-S
    skuPrefix: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{1,20}$/, "Use letters, numbers and dashes only")
      .optional(),
  }),
});

const variantFields = {
  sku: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-_]{1,60}$/, "SKU may contain letters, numbers, dash and underscore")
    .optional(),
  barcode: z.string().trim().max(60).nullable().optional(),
  price: z.coerce.number().min(0).optional(),
  comparePrice: z.coerce.number().min(0).nullable().optional(),
  costPrice: z.coerce.number().min(0).nullable().optional(),
  stock: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  weight: z.coerce.number().min(0).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
};

export const createVariantSchema = z.object({
  params: idParam,
  body: z.object({
    valueIds: z.array(z.string().min(1)).min(1, "Pick at least one option value"),
    ...variantFields,
    price: z.coerce.number().min(0),
    stock: z.coerce.number().int().min(0).default(0),
  }),
});

export const updateVariantSchema = z.object({
  params: idParam,
  body: z
    .object(variantFields)
    .refine((v) => Object.keys(v).length > 0, "Nothing to update"),
});

/** Bulk price/stock edit -- the natural follow-up to matrix generation. */
export const bulkUpdateVariantsSchema = z.object({
  params: idParam,
  body: z.object({
    variants: z
      .array(
        z.object({
          id: z.string().min(1),
          ...variantFields,
        }),
      )
      .min(1)
      .max(200),
  }),
});

export const variantIdSchema = z.object({ params: idParam });

export type AttachOptionsInput = z.infer<typeof attachOptionsSchema>["body"];
export type GenerateVariantsInput = z.infer<
  typeof generateVariantsSchema
>["body"];
export type CreateVariantInput = z.infer<typeof createVariantSchema>["body"];
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>["body"];
export type BulkUpdateInput = z.infer<typeof bulkUpdateVariantsSchema>["body"];
