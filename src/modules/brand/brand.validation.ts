import { z } from "zod";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });
const slugParam = z.object({ slug: z.string().min(1) });

const brandFields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N}-]+$/u, "Slug may contain letters, numbers and dashes")
    .max(80)
    .optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  logo: z.url().nullable().optional(),
  logoPublicId: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  metaTitle: z.string().trim().max(160).nullable().optional(),
  metaDescription: z.string().trim().max(320).nullable().optional(),
  metaKeywords: z.string().trim().max(255).nullable().optional(),
};

export const createBrandSchema = z.object({
  body: z.object(brandFields),
});

export const updateBrandSchema = z.object({
  params: idParam,
  body: z
    .object({
      ...brandFields,
      name: brandFields.name.optional(),
      sortOrder: z.coerce.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "Nothing to update"),
});

export const listBrandsSchema = z.object({
  query: paginationQuery.extend({
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  }),
});

export const brandIdSchema = z.object({ params: idParam });
export const brandSlugSchema = z.object({ params: slugParam });

export type CreateBrandInput = z.infer<typeof createBrandSchema>["body"];
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>["body"];
export type ListBrandsQuery = z.infer<typeof listBrandsSchema>["query"];
