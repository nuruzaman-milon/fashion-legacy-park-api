import { Router } from "express";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate } from "../../middlewares/auth.middleware";
import * as controller from "./cart.controller";
import {
  addToCartSchema,
  cartItemIdSchema,
  updateCartItemSchema,
} from "./cart.validation";

const router = Router();

// Login required by design -- there is no guest cart. Every query in the
// service is scoped to req.user.id.
router.use(authenticate);

router.get("/", controller.get);

router.delete("/", controller.clear);

// Bulk removal of everything that has gone out of stock or been withdrawn.
router.delete("/unavailable", controller.removeUnavailable);

router.post("/items", validateRequest(addToCartSchema), controller.add);

router.patch(
  "/items/:id",
  validateRequest(updateCartItemSchema),
  controller.update,
);

router.delete(
  "/items/:id",
  validateRequest(cartItemIdSchema),
  controller.remove,
);

router.post(
  "/items/:id/move-to-wishlist",
  validateRequest(cartItemIdSchema),
  controller.moveToWishlist,
);

export default router;
