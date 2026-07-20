import { z } from "zod";

const idParam = z.object({ id: z.string().min(1) });

// A per-line ceiling. Without one, a single request can claim a supplier's
// entire stock of an item and hold up the listing for everyone else.
const MAX_QTY = 99;

export const addToCartSchema = z.object({
  body: z.object({
    variantId: z.string().min(1, "Variant is required"),
    quantity: z.coerce.number().int().min(1).max(MAX_QTY).default(1),
  }),
});

export const updateCartItemSchema = z.object({
  params: idParam,
  body: z.object({
    // 0 is not allowed: removing is DELETE, so a quantity of 0 is almost always
    // a client bug rather than an intent to remove.
    quantity: z.coerce.number().int().min(1).max(MAX_QTY),
  }),
});

export const cartItemIdSchema = z.object({ params: idParam });

export const moveToWishlistSchema = z.object({ params: idParam });

export type AddToCartInput = z.infer<typeof addToCartSchema>["body"];
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>["body"];
