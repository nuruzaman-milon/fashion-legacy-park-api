import { z } from "zod";
import { OptionDisplayType } from "@prisma/client";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #FF0000");

export const createOptionSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, "Name is required").max(50),
    slug: z
      .string()
      .trim()
      .regex(/^[\p{L}\p{N}-]+$/u, "Slug may contain letters, numbers and dashes")
      .max(50)
      .optional(),
    displayType: z.enum(OptionDisplayType).default(OptionDisplayType.DROPDOWN),
    sortOrder: z.coerce.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  }),
});

export const updateOptionSchema = z.object({
  params: idParam,
  body: z
    .object({
      name: z.string().trim().min(1).max(50).optional(),
      displayType: z.enum(OptionDisplayType).optional(),
      sortOrder: z.coerce.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "Nothing to update"),
});

/**
 * A SWATCH option renders as colour chips, so its values need a hex code --
 * without one the swatch is blank and the customer sees nothing to click. The
 * cross-field check lives in the service, which knows the parent's displayType.
 */
export const createOptionValueSchema = z.object({
  params: idParam,
  body: z.object({
    value: z.string().trim().min(1, "Value is required").max(50),
    slug: z
      .string()
      .trim()
      .regex(/^[\p{L}\p{N}-]+$/u, "Slug may contain letters, numbers and dashes")
      .max(50)
      .optional(),
    hexColor: hexColor.nullable().optional(),
    // Explicit ordering, so sizes render S, M, L, XL rather than sorting
    // alphabetically to L, M, S, XL.
    sortOrder: z.coerce.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  }),
});

export const updateOptionValueSchema = z.object({
  params: idParam,
  body: z
    .object({
      value: z.string().trim().min(1).max(50).optional(),
      hexColor: hexColor.nullable().optional(),
      sortOrder: z.coerce.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "Nothing to update"),
});

export const listOptionsSchema = z.object({
  query: paginationQuery.extend({
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  }),
});

export const optionIdSchema = z.object({ params: idParam });

export type CreateOptionInput = z.infer<typeof createOptionSchema>["body"];
export type UpdateOptionInput = z.infer<typeof updateOptionSchema>["body"];
export type CreateOptionValueInput = z.infer<
  typeof createOptionValueSchema
>["body"];
export type UpdateOptionValueInput = z.infer<
  typeof updateOptionValueSchema
>["body"];
export type ListOptionsQuery = z.infer<typeof listOptionsSchema>["query"];
