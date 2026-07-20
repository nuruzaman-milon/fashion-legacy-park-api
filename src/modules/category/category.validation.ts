import { z } from "zod";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });
const slugParam = z.object({ slug: z.string().min(1) });

// Each image is paired with its Cloudinary public_id so a replacement can
// delete the old file. Written out rather than generated: a computed-key helper
// erases the literal keys from Zod's inferred type, which then cannot be indexed.
const imageFields = {
  icon: z.url().nullable().optional(),
  iconPublicId: z.string().nullable().optional(),
  image: z.url().nullable().optional(),
  imagePublicId: z.string().nullable().optional(),
  banner: z.url().nullable().optional(),
  bannerPublicId: z.string().nullable().optional(),
};

const seoFields = {
  metaTitle: z.string().trim().max(160).nullable().optional(),
  metaDescription: z.string().trim().max(320).nullable().optional(),
  metaKeywords: z.string().trim().max(255).nullable().optional(),
};

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
    // Optional: generated from the name when omitted.
    slug: z
      .string()
      .trim()
      .regex(/^[\p{L}\p{N}-]+$/u, "Slug may contain letters, numbers and dashes")
      .max(80)
      .optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    parentId: z.string().min(1).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    ...imageFields,
    ...seoFields,
  }),
});

export const updateCategorySchema = z.object({
  params: idParam,
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      slug: z
        .string()
        .trim()
        .regex(/^[\p{L}\p{N}-]+$/u, "Slug may contain letters, numbers and dashes")
        .max(80)
        .optional(),
      description: z.string().trim().max(1000).nullable().optional(),
      parentId: z.string().min(1).nullable().optional(),
      sortOrder: z.coerce.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
      ...imageFields,
      ...seoFields,
    })
    .refine((v) => Object.keys(v).length > 0, "Nothing to update"),
});

export const listCategoriesSchema = z.object({
  query: paginationQuery.extend({
    parentId: z.string().min(1).optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    rootOnly: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  }),
});

export const categoryIdSchema = z.object({ params: idParam });
export const categorySlugSchema = z.object({ params: slugParam });

export const reorderCategoriesSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          sortOrder: z.coerce.number().int().min(0),
        }),
      )
      .min(1, "At least one item is required")
      .max(500),
  }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>["body"];
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>["body"];
export type ListCategoriesQuery = z.infer<typeof listCategoriesSchema>["query"];
export type ReorderInput = z.infer<typeof reorderCategoriesSchema>["body"];
