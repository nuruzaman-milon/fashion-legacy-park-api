import { Router } from "express";
import { Role } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./coupon.controller";
import {
  couponIdSchema,
  createCouponSchema,
  listCouponsSchema,
  previewCouponSchema,
  updateCouponSchema,
} from "./coupon.validation";

// ---- /api/v1/coupons  (signed-in customers) -------------------------------

export const publicCouponRoutes = Router();

// Authenticated, not admin: the preview reads the caller's own cart and
// per-user redemption count.
publicCouponRoutes.post(
  "/preview",
  authenticate,
  validateRequest(previewCouponSchema),
  controller.preview,
);

// ---- /api/v1/admin/coupons ------------------------------------------------

export const adminCouponRoutes = Router();

adminCouponRoutes.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

adminCouponRoutes.get("/", validateRequest(listCouponsSchema), controller.list);

adminCouponRoutes.post(
  "/",
  validateRequest(createCouponSchema),
  controller.create,
);

adminCouponRoutes.get(
  "/:id",
  validateRequest(couponIdSchema),
  controller.getOne,
);

adminCouponRoutes.patch(
  "/:id",
  validateRequest(updateCouponSchema),
  controller.update,
);

adminCouponRoutes.delete(
  "/:id",
  validateRequest(couponIdSchema),
  controller.remove,
);
