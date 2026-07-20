import { Router } from "express";
import { Role } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./brand.controller";
import {
  brandIdSchema,
  brandSlugSchema,
  createBrandSchema,
  listBrandsSchema,
  updateBrandSchema,
} from "./brand.validation";

// ---- /api/v1/brands  (public) ---------------------------------------------

export const publicBrandRoutes = Router();

publicBrandRoutes.get("/", controller.listActive);

publicBrandRoutes.get(
  "/:slug",
  validateRequest(brandSlugSchema),
  controller.getBySlug,
);

// ---- /api/v1/admin/brands -------------------------------------------------

export const adminBrandRoutes = Router();

adminBrandRoutes.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

adminBrandRoutes.get("/", validateRequest(listBrandsSchema), controller.list);

adminBrandRoutes.post("/", validateRequest(createBrandSchema), controller.create);

adminBrandRoutes.get("/:id", validateRequest(brandIdSchema), controller.getOne);

adminBrandRoutes.patch(
  "/:id",
  validateRequest(updateBrandSchema),
  controller.update,
);

adminBrandRoutes.delete(
  "/:id",
  validateRequest(brandIdSchema),
  controller.remove,
);
