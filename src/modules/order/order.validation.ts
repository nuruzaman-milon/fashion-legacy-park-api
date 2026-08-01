import { z } from "zod";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

const bdPhone = z
  .string()
  .regex(/^01[3-9]\d{8}$/, "Enter a valid Bangladeshi mobile number");

/**
 * COD only for now: BKASH / SSLCOMMERZ are in the enum but taking them here
 * would record an order as awaiting a gateway callback that nothing sends.
 */
export const placeOrderSchema = z.object({
  body: z.object({
    receiverName: z.string().trim().min(2, "Enter the receiver's name").max(100),
    phone: bdPhone,
    district: z.string().trim().min(2).max(100),
    address: z.string().trim().min(5, "Enter the full street address").max(255),
    upazila: z.string().trim().max(100).optional(),
    area: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(20).optional(),
    note: z.string().trim().max(500).optional(),
    paymentMethod: z.literal("COD"),
  }),
});

export const listMyOrdersSchema = z.object({ query: paginationQuery });

export const orderIdSchema = z.object({ params: idParam });

export const cancelOrderSchema = z.object({
  params: idParam,
  body: z.object({
    reason: z.string().trim().max(255).optional(),
  }),
});

export const adminListOrdersSchema = z.object({
  query: paginationQuery.extend({
    orderStatus: z.enum(OrderStatus).optional(),
    paymentStatus: z.enum(PaymentStatus).optional(),
  }),
});

// PENDING is never a target (orders are born there), RETURNED belongs to the
// returns flow that does not exist yet.
export const adminUpdateStatusSchema = z.object({
  params: idParam,
  body: z.object({
    status: z.enum([
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ]),
    note: z.string().trim().max(500).optional(),
  }),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>["body"];
export type ListMyOrdersQuery = z.infer<typeof listMyOrdersSchema>["query"];
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>["body"];
export type AdminListOrdersQuery = z.infer<
  typeof adminListOrdersSchema
>["query"];
export type AdminUpdateStatusInput = z.infer<
  typeof adminUpdateStatusSchema
>["body"];
