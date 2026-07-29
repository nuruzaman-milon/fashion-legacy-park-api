import { Router } from "express";
import { Role } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./banner.controller";
import {
  bannerIdSchema,
  createBannerSchema,
  listBannersSchema,
  reorderBannersSchema,
  updateBannerSchema,
} from "./banner.validation";

// ---- /api/v1/banners  (public, storefront hero) ---------------------------

export const publicBannerRoutes = Router();

publicBannerRoutes.get("/", controller.listActive);

// ---- /api/v1/admin/banners ------------------------------------------------

export const adminBannerRoutes = Router();

adminBannerRoutes.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

adminBannerRoutes.get("/", validateRequest(listBannersSchema), controller.list);

adminBannerRoutes.post(
  "/",
  validateRequest(createBannerSchema),
  controller.create,
);

// Before /:id, otherwise "reorder" is captured as an id.
adminBannerRoutes.patch(
  "/reorder",
  validateRequest(reorderBannersSchema),
  controller.reorder,
);

adminBannerRoutes.get(
  "/:id",
  validateRequest(bannerIdSchema),
  controller.getOne,
);

adminBannerRoutes.patch(
  "/:id",
  validateRequest(updateBannerSchema),
  controller.update,
);

adminBannerRoutes.delete(
  "/:id",
  validateRequest(bannerIdSchema),
  controller.remove,
);
