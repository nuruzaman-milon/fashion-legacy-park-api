import { Router } from "express";
import { Role } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./seller.controller";
import {
  adminUpdateSellerSchema,
  createSellerSchema,
  getSellerSchema,
  listSellersSchema,
  sellerSelfUpdateSchema,
  updateSellerStatusSchema,
} from "./seller.validation";

// ---- /api/v1/admin/sellers -----------------------------------------------

export const adminSellerRoutes = Router();

adminSellerRoutes.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

adminSellerRoutes.post(
  "/",
  validateRequest(createSellerSchema),
  controller.create,
);

adminSellerRoutes.get("/", validateRequest(listSellersSchema), controller.list);

adminSellerRoutes.get(
  "/:id",
  validateRequest(getSellerSchema),
  controller.getOne,
);

adminSellerRoutes.patch(
  "/:id",
  validateRequest(adminUpdateSellerSchema),
  controller.update,
);

adminSellerRoutes.patch(
  "/:id/status",
  validateRequest(updateSellerStatusSchema),
  controller.updateStatus,
);

// ---- /api/v1/seller -------------------------------------------------------

export const sellerRoutes = Router();

sellerRoutes.use(authenticate, authorize(Role.SELLER));

sellerRoutes.get("/me", controller.getMine);

// Uses sellerSelfUpdateSchema, NOT the admin one: commissionRate, status and
// code are not part of it, so a seller cannot edit their own commission.
sellerRoutes.patch(
  "/me",
  validateRequest(sellerSelfUpdateSchema),
  controller.updateMine,
);
