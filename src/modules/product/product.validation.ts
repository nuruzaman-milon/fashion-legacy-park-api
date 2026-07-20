import { z } from "zod";
import { ProductStatus } from "@prisma/client";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

const contentFields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N}-]+$/u, "Slug may contain letters, numbers and dashes")
    .max(120)
    .optional(),
  shortDescription: z.string().trim().max(500).nullable().optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  videoUrl: z.url().nullable().optional(),
  specifications: z.record(z.string(), z.unknown()).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  metaTitle: z.string().trim().max(160).nullable().optional(),
  metaDescription: z.string().trim().max(320).nullable().optional(),
  metaKeywords: z.string().trim().max(255).nullable().optional(),
};

export const createProductSchema = z.object({
  body: z.object({
    ...contentFields,
    categoryId: z.string().min(1, "Category is required"),
    brandId: z.string().min(1).nullable().optional(),
    // Admin-only in practice; the service strips it for sellers.
    sellerId: z.string().min(1).nullable().optional(),
    isFeatured: z.boolean().default(false),
  }),
});

export const updateProductSchema = z.object({
  params: idParam,
  body: z
    .object({
      ...contentFields,
      name: contentFields.name.optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
      categoryId: z.string().min(1).optional(),
      brandId: z.string().min(1).nullable().optional(),
      isFeatured: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "Nothing to update"),
});

/**
 * Status transitions an admin can drive. Sellers submit for review through
 * /submit instead, so they cannot set ACTIVE on their own work.
 */
export const productStatusSchema = z.object({
  params: idParam,
  body: z.object({
    status: z.enum([
      ProductStatus.DRAFT,
      ProductStatus.ACTIVE,
      ProductStatus.INACTIVE,
      ProductStatus.REJECTED,
    ]),
    rejectionReason: z.string().trim().max(500).nullable().optional(),
  }),
});

export const listManageProductsSchema = z.object({
  query: paginationQuery.extend({
    status: z.enum(ProductStatus).optional(),
    categoryId: z.string().min(1).optional(),
    brandId: z.string().min(1).optional(),
    sellerId: z.string().min(1).optional(),
    isFeatured: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  }),
});

/** Public storefront listing. Never exposes status or seller filters. */
export const browseProductsSchema = z.object({
  query: paginationQuery.extend({
    categoryId: z.string().min(1).optional(),
    categorySlug: z.string().min(1).optional(),
    brandId: z.string().min(1).optional(),
    brandSlug: z.string().min(1).optional(),
    tag: z.string().trim().min(1).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    inStock: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    isFeatured: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    // Filter by option values, e.g. all Red items in size L.
    // Repeated query params arrive as an array, a single one as a string.
    optionValueIds: z
      .union([z.string(), z.array(z.string())])
      .transform((v) => (Array.isArray(v) ? v : [v]))
      .optional(),
    sort: z
      .enum(["newest", "price-asc", "price-desc", "rating", "best-selling"])
      .default("newest"),
  }),
});

export const productIdSchema = z.object({ params: idParam });
export const productSlugSchema = z.object({
  params: z.object({ slug: z.string().min(1) }),
});

export type CreateProductInput = z.infer<typeof createProductSchema>["body"];
export type UpdateProductInput = z.infer<typeof updateProductSchema>["body"];
export type ProductStatusInput = z.infer<typeof productStatusSchema>["body"];
export type ListManageQuery = z.infer<typeof listManageProductsSchema>["query"];
export type BrowseQuery = z.infer<typeof browseProductsSchema>["query"];
