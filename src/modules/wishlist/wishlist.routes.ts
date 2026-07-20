import { Router } from "express";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate } from "../../middlewares/auth.middleware";
import * as controller from "./wishlist.controller";
import {
  addToWishlistSchema,
  listWishlistSchema,
  moveToCartSchema,
  productIdParamSchema,
} from "./wishlist.service";

const router = Router();

// Login required by design -- no guest wishlist.
router.use(authenticate);

router.get("/", validateRequest(listWishlistSchema), controller.list);

router.post("/", validateRequest(addToWishlistSchema), controller.add);

// Keyed by productId, not by wishlist-entry id: the client already knows the
// product it is rendering a heart icon for.
router.post(
  "/:productId/toggle",
  validateRequest(productIdParamSchema),
  controller.toggle,
);

router.post(
  "/:productId/move-to-cart",
  validateRequest(moveToCartSchema),
  controller.moveToCart,
);

router.delete(
  "/:productId",
  validateRequest(productIdParamSchema),
  controller.remove,
);

export default router;
