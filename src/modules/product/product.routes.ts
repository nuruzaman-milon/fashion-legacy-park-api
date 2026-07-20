import { Router } from "express";
import { Role } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./product.controller";
import {
  browseProductsSchema,
  createProductSchema,
  listManageProductsSchema,
  productIdSchema,
  productSlugSchema,
  productStatusSchema,
  updateProductSchema,
} from "./product.validation";
import {
  attachOptionsSchema,
  bulkUpdateVariantsSchema,
  createVariantSchema,
  generateVariantsSchema,
  updateVariantSchema,
  variantIdSchema,
} from "./variant.validation";
import {
  addImageSchema,
  imageIdSchema,
  reorderImagesSchema,
} from "./image.service";

// ---- /api/v1/products  (public storefront) --------------------------------

export const publicProductRoutes = Router();

publicProductRoutes.get(
  "/",
  validateRequest(browseProductsSchema),
  controller.browse,
);

publicProductRoutes.get(
  "/:slug",
  validateRequest(productSlugSchema),
  controller.detail,
);

// ---- manage routes --------------------------------------------------------
//
// ONE router, mounted twice: at /admin/products for staff and /seller/products
// for suppliers. Every service call takes the actor and scopes by sellerId when
// the caller is a SELLER, so a supplier only ever sees their own catalogue.
//
// Duplicating these as two route files would mean every future change has to be
// made in both places -- and the one that gets forgotten is the security hole.

const buildManageRoutes = () => {
  const router = Router();

  router.get("/", validateRequest(listManageProductsSchema), controller.list);
  router.post("/", validateRequest(createProductSchema), controller.create);

  router.get("/:id", validateRequest(productIdSchema), controller.getOne);
  router.patch("/:id", validateRequest(updateProductSchema), controller.update);
  router.delete("/:id", validateRequest(productIdSchema), controller.remove);

  router.post("/:id/submit", validateRequest(productIdSchema), controller.submit);

  // options & variants
  router.post(
    "/:id/options",
    validateRequest(attachOptionsSchema),
    controller.attachOptions,
  );
  router.get(
    "/:id/variants",
    validateRequest(productIdSchema),
    controller.listVariants,
  );
  router.post(
    "/:id/variants",
    validateRequest(createVariantSchema),
    controller.createVariant,
  );
  router.post(
    "/:id/variants/generate",
    validateRequest(generateVariantsSchema),
    controller.generateVariants,
  );
  router.patch(
    "/:id/variants/bulk",
    validateRequest(bulkUpdateVariantsSchema),
    controller.bulkUpdateVariants,
  );

  // images
  router.get(
    "/:id/images",
    validateRequest(productIdSchema),
    controller.listImages,
  );
  router.post("/:id/images", validateRequest(addImageSchema), controller.addImage);
  router.patch(
    "/:id/images/reorder",
    validateRequest(reorderImagesSchema),
    controller.reorderImages,
  );

  return router;
};

/** Variants and images addressed by their own id, not nested under a product. */
const buildResourceRoutes = () => {
  const router = Router();

  router.patch(
    "/variants/:id",
    validateRequest(updateVariantSchema),
    controller.updateVariant,
  );
  router.delete(
    "/variants/:id",
    validateRequest(variantIdSchema),
    controller.deleteVariant,
  );

  router.patch(
    "/images/:id/primary",
    validateRequest(imageIdSchema),
    controller.setPrimaryImage,
  );
  router.delete(
    "/images/:id",
    validateRequest(imageIdSchema),
    controller.deleteImage,
  );

  return router;
};

// ---- /api/v1/admin/products ----------------------------------------------

export const adminProductRoutes = Router();

adminProductRoutes.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

// Admin-only: approve, reject, publish. Sellers use POST /:id/submit instead,
// so they can never set their own work live.
adminProductRoutes.patch(
  "/:id/status",
  validateRequest(productStatusSchema),
  controller.setStatus,
);

adminProductRoutes.use(buildManageRoutes());

export const adminCatalogResourceRoutes = Router();
adminCatalogResourceRoutes.use(
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.ADMIN),
);
adminCatalogResourceRoutes.use(buildResourceRoutes());

// ---- /api/v1/seller/products ----------------------------------------------

export const sellerProductRoutes = Router();

sellerProductRoutes.use(authenticate, authorize(Role.SELLER));
sellerProductRoutes.use(buildManageRoutes());

export const sellerCatalogResourceRoutes = Router();
sellerCatalogResourceRoutes.use(authenticate, authorize(Role.SELLER));
sellerCatalogResourceRoutes.use(buildResourceRoutes());
