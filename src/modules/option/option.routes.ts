import { Router } from "express";
import { Role } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./option.controller";
import {
  createOptionSchema,
  createOptionValueSchema,
  listOptionsSchema,
  optionIdSchema,
  updateOptionSchema,
  updateOptionValueSchema,
} from "./option.validation";

// ---- /api/v1/options  (public) --------------------------------------------
// Powers the storefront filter sidebar, and the option pickers sellers use when
// building a product.

export const publicOptionRoutes = Router();

publicOptionRoutes.get("/", controller.listActive);

// ---- /api/v1/admin/options ------------------------------------------------
// Admin-only by design: the whole point of a global library is that "Red" is
// defined once. Letting every seller add their own would reintroduce the
// Red/red/RED divergence it exists to prevent.

export const adminOptionRoutes = Router();

adminOptionRoutes.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

adminOptionRoutes.get("/", validateRequest(listOptionsSchema), controller.list);

adminOptionRoutes.post(
  "/",
  validateRequest(createOptionSchema),
  controller.create,
);

adminOptionRoutes.get(
  "/:id",
  validateRequest(optionIdSchema),
  controller.getOne,
);

adminOptionRoutes.patch(
  "/:id",
  validateRequest(updateOptionSchema),
  controller.update,
);

adminOptionRoutes.delete(
  "/:id",
  validateRequest(optionIdSchema),
  controller.remove,
);

adminOptionRoutes.post(
  "/:id/values",
  validateRequest(createOptionValueSchema),
  controller.createValue,
);

// ---- /api/v1/admin/option-values ------------------------------------------
// Separate mount: a value is addressed by its own id, not nested under its
// option, so PATCH/DELETE do not need the parent in the path.

export const adminOptionValueRoutes = Router();

adminOptionValueRoutes.use(
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.ADMIN),
);

adminOptionValueRoutes.patch(
  "/:id",
  validateRequest(updateOptionValueSchema),
  controller.updateValue,
);

adminOptionValueRoutes.delete(
  "/:id",
  validateRequest(optionIdSchema),
  controller.removeValue,
);
