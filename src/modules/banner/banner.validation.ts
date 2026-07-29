import { z } from "zod";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

// Paired with its Cloudinary public_id like every other image in the catalog,
// so replacing a supporting image can delete the old file.
const supportingImage = z.object({
  src: z.url(),
  alt: z.string().trim().max(255).optional(),
  publicId: z.string().optional(),
});

const bannerFields = {
  eyebrow: z.string().trim().max(120).nullable().optional(),
  subtitle: z.string().trim().max(500).nullable().optional(),
  mobileImageUrl: z.url().nullable().optional(),
  imageAlt: z.string().trim().max(255).nullable().optional(),
  desktopImagePublicId: z.string().nullable().optional(),
  mobileImagePublicId: z.string().nullable().optional(),
  supportingImages: z.array(supportingImage).max(4).nullable().optional(),
  buttonText: z.string().trim().max(60).nullable().optional(),
  // Plain string, not z.url(): hero CTAs link to internal paths like
  // "/products?category=womens-wear".
  buttonLink: z.string().trim().max(500).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
};

export const createBannerSchema = z.object({
  body: z.object({
    ...bannerFields,
    title: z.string().trim().min(2, "Title must be at least 2 characters").max(160),
    desktopImageUrl: z.url(),
  }),
});

export const updateBannerSchema = z.object({
  params: idParam,
  body: z
    .object({
      ...bannerFields,
      title: z.string().trim().min(2).max(160).optional(),
      desktopImageUrl: z.url().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "Nothing to update"),
});

export const listBannersSchema = z.object({
  query: paginationQuery.extend({
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  }),
});

export const bannerIdSchema = z.object({ params: idParam });

export const reorderBannersSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          sortOrder: z.coerce.number().int().min(0),
        }),
      )
      .min(1, "At least one item is required")
      .max(100),
  }),
});

export type CreateBannerInput = z.infer<typeof createBannerSchema>["body"];
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>["body"];
export type ListBannersQuery = z.infer<typeof listBannersSchema>["query"];
export type ReorderBannersInput = z.infer<typeof reorderBannersSchema>["body"];
