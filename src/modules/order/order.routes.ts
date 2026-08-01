import { Router } from "express";
import { Role } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./order.controller";
import {
  adminListOrdersSchema,
  adminUpdateStatusSchema,
  cancelOrderSchema,
  listMyOrdersSchema,
  orderIdSchema,
  placeOrderSchema,
} from "./order.validation";

// ---- /api/v1/orders  (the signed-in customer's own orders) ----------------

export const orderRoutes = Router();

orderRoutes.use(authenticate);

orderRoutes.post("/", validateRequest(placeOrderSchema), controller.place);

orderRoutes.get("/", validateRequest(listMyOrdersSchema), controller.listMine);

orderRoutes.get("/:id", validateRequest(orderIdSchema), controller.getMine);

orderRoutes.post(
  "/:id/cancel",
  validateRequest(cancelOrderSchema),
  controller.cancelMine,
);

// ---- /api/v1/admin/orders --------------------------------------------------

export const adminOrderRoutes = Router();

adminOrderRoutes.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

adminOrderRoutes.get(
  "/",
  validateRequest(adminListOrdersSchema),
  controller.adminList,
);

adminOrderRoutes.get(
  "/:id",
  validateRequest(orderIdSchema),
  controller.adminGet,
);

adminOrderRoutes.patch(
  "/:id/status",
  validateRequest(adminUpdateStatusSchema),
  controller.adminSetStatus,
);
