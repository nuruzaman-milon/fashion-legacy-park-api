import { z } from "zod";
import { SellerStatus } from "@prisma/client";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

const bdPhone = z
  .string()
  .regex(/^01[3-9]\d{8}$/, "Enter a valid Bangladeshi mobile number");

// Bank / payout details. Shared by both sides -- a seller may maintain their own.
const payoutFields = {
  bankAccountName: z.string().trim().max(100).optional(),
  bankAccountNumber: z.string().trim().max(50).optional(),
  bankName: z.string().trim().max(100).optional(),
  bankBranch: z.string().trim().max(100).optional(),
  bkashNumber: bdPhone.optional(),
};

// Shop details a seller is allowed to maintain themselves.
const shopFields = {
  shopName: z.string().trim().min(2).max(150).optional(),
  contactName: z.string().trim().max(100).optional(),
  contactPhone: bdPhone.optional(),
  contactEmail: z.email("Invalid email address").toLowerCase().trim().optional(),
  address: z.string().trim().max(255).optional(),
};

export const createSellerSchema = z.object({
  body: z.object({
    // Login account for the seller.
    name: z.string().trim().min(2).max(100),
    email: z.email("Invalid email address").toLowerCase().trim(),

    shopName: z.string().trim().min(2).max(150),
    contactPhone: bdPhone,
    contactName: z.string().trim().max(100).optional(),
    contactEmail: z
      .email("Invalid email address")
      .toLowerCase()
      .trim()
      .optional(),
    address: z.string().trim().max(255).optional(),

    commissionRate: z.coerce.number().min(0).max(100).default(0),

    ...payoutFields,
  }),
});

export const listSellersSchema = z.object({
  query: paginationQuery.extend({
    status: z.enum(SellerStatus).optional(),
  }),
});

export const getSellerSchema = z.object({ params: idParam });

// Admin may set the commission; the seller-side schema below deliberately may not.
export const adminUpdateSellerSchema = z.object({
  params: idParam,
  body: z.object({
    ...shopFields,
    ...payoutFields,
    commissionRate: z.coerce.number().min(0).max(100).optional(),
  }),
});

export const updateSellerStatusSchema = z.object({
  params: idParam,
  body: z.object({
    status: z.enum(SellerStatus),
  }),
});

/**
 * Seller-side update.
 *
 * `commissionRate`, `status` and `code` are absent by design. A seller who
 * could edit their own commission could set it to 0 and keep the platform's
 * entire cut -- a direct financial hole, not a permissions nicety.
 */
export const sellerSelfUpdateSchema = z.object({
  body: z.object({
    ...shopFields,
    ...payoutFields,
  }),
});

export type CreateSellerInput = z.infer<typeof createSellerSchema>["body"];
export type ListSellersQuery = z.infer<typeof listSellersSchema>["query"];
export type AdminUpdateSellerInput = z.infer<
  typeof adminUpdateSellerSchema
>["body"];
export type SellerSelfUpdateInput = z.infer<
  typeof sellerSelfUpdateSchema
>["body"];
