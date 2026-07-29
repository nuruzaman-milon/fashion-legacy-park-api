import { Router } from "express";
import { Role } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./flash-sale.controller";
import {
  createFlashSaleSchema,
  flashSaleIdSchema,
  listFlashSalesSchema,
  setItemsSchema,
  setRulesSchema,
  updateFlashSaleSchema,
} from "./flash-sale.validation";

// ---- /api/v1/flash-sales  (public, storefront) ----------------------------

export const publicFlashSaleRoutes = Router();

publicFlashSaleRoutes.get("/active", controller.active);

// ---- /api/v1/admin/flash-sales --------------------------------------------

export const adminFlashSaleRoutes = Router();

adminFlashSaleRoutes.use(
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.ADMIN),
);

adminFlashSaleRoutes.get(
  "/",
  validateRequest(listFlashSalesSchema),
  controller.list,
);

adminFlashSaleRoutes.post(
  "/",
  validateRequest(createFlashSaleSchema),
  controller.create,
);

adminFlashSaleRoutes.get(
  "/:id",
  validateRequest(flashSaleIdSchema),
  controller.getOne,
);

adminFlashSaleRoutes.patch(
  "/:id",
  validateRequest(updateFlashSaleSchema),
  controller.update,
);

adminFlashSaleRoutes.delete(
  "/:id",
  validateRequest(flashSaleIdSchema),
  controller.remove,
);

adminFlashSaleRoutes.put(
  "/:id/rules",
  validateRequest(setRulesSchema),
  controller.setRules,
);

adminFlashSaleRoutes.put(
  "/:id/items",
  validateRequest(setItemsSchema),
  controller.setItems,
);
