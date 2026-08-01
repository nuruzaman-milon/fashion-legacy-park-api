import { Router } from "express";
import { Role } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./review.controller";
import {
  adminListReviewsSchema,
  createReviewSchema,
  replySchema,
  reviewIdSchema,
  setReviewStatusSchema,
} from "./review.validation";

// ---- /api/v1/reviews  (the signed-in customer writes one) -----------------
// Reading happens through the product detail payload, which embeds the
// latest APPROVED reviews — there is no separate public listing.

export const reviewRoutes = Router();

reviewRoutes.post(
  "/",
  authenticate,
  validateRequest(createReviewSchema),
  controller.create,
);

// ---- /api/v1/admin/reviews -------------------------------------------------

export const adminReviewRoutes = Router();

adminReviewRoutes.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

adminReviewRoutes.get(
  "/",
  validateRequest(adminListReviewsSchema),
  controller.adminList,
);

adminReviewRoutes.patch(
  "/:id/status",
  validateRequest(setReviewStatusSchema),
  controller.setStatus,
);

adminReviewRoutes.patch(
  "/:id/reply",
  validateRequest(replySchema),
  controller.reply,
);

adminReviewRoutes.delete(
  "/:id",
  validateRequest(reviewIdSchema),
  controller.remove,
);
