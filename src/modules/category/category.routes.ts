import { Router } from "express";
import { Role } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./category.controller";
import {
  categoryIdSchema,
  categorySlugSchema,
  createCategorySchema,
  listCategoriesSchema,
  reorderCategoriesSchema,
  setMenuProductsSchema,
  updateCategorySchema,
} from "./category.validation";

// ---- /api/v1/categories  (public, storefront) -----------------------------
// Only active categories. Sellers read these too when creating a product.

export const publicCategoryRoutes = Router();

publicCategoryRoutes.get("/tree", controller.tree);

// Tree + curated panel products in one response; the navbar's only call.
// Static paths stay above /:slug or they get captured as slugs.
publicCategoryRoutes.get("/menu", controller.menu);

// Admin-curated homepage "Shop by category" tiles.
publicCategoryRoutes.get("/featured", controller.featured);

publicCategoryRoutes.get(
  "/:slug",
  validateRequest(categorySlugSchema),
  controller.getBySlug,
);

// ---- /api/v1/admin/categories --------------------------------------------
// Separate router rather than branching on the caller's role: an endpoint that
// silently returns more rows to some callers is easy to get wrong.

export const adminCategoryRoutes = Router();

adminCategoryRoutes.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

adminCategoryRoutes.get(
  "/",
  validateRequest(listCategoriesSchema),
  controller.list,
);

adminCategoryRoutes.post(
  "/",
  validateRequest(createCategorySchema),
  controller.create,
);

// Before /:id, otherwise "reorder" is captured as an id.
adminCategoryRoutes.patch(
  "/reorder",
  validateRequest(reorderCategoriesSchema),
  controller.reorder,
);

adminCategoryRoutes.get(
  "/:id",
  validateRequest(categoryIdSchema),
  controller.getOne,
);

adminCategoryRoutes.patch(
  "/:id",
  validateRequest(updateCategorySchema),
  controller.update,
);

adminCategoryRoutes.delete(
  "/:id",
  validateRequest(categoryIdSchema),
  controller.remove,
);

// ---- megamenu panel curation ("Our Recommendation") ----

adminCategoryRoutes.get(
  "/:id/menu-products",
  validateRequest(categoryIdSchema),
  controller.getMenuProducts,
);

adminCategoryRoutes.put(
  "/:id/menu-products",
  validateRequest(setMenuProductsSchema),
  controller.setMenuProducts,
);
