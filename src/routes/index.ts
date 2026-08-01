import { Router } from "express";
import { sendResponse } from "../utils/response";
import { authRoutes } from "../modules/auth";
import { addressRoutes } from "../modules/address";
import { adminUserRoutes } from "../modules/user";
import { adminSellerRoutes, sellerRoutes } from "../modules/seller";
import { publicCategoryRoutes, adminCategoryRoutes } from "../modules/category";
import { publicBrandRoutes, adminBrandRoutes } from "../modules/brand";
import { publicBannerRoutes, adminBannerRoutes } from "../modules/banner";
import {
  publicFlashSaleRoutes,
  adminFlashSaleRoutes,
} from "../modules/flash-sale";
import {
  publicOptionRoutes,
  adminOptionRoutes,
  adminOptionValueRoutes,
} from "../modules/option";
import {
  publicProductRoutes,
  adminProductRoutes,
  adminCatalogResourceRoutes,
  sellerProductRoutes,
  sellerCatalogResourceRoutes,
} from "../modules/product";
import { cartRoutes } from "../modules/cart";
import { wishlistRoutes } from "../modules/wishlist";
import { orderRoutes, adminOrderRoutes } from "../modules/order";
import { adminStatsRoutes } from "../modules/dashboard";
import { reviewRoutes, adminReviewRoutes } from "../modules/review";
import { notificationRoutes } from "../modules/notification";
import { chatRoutes, adminChatRoutes } from "../modules/chat";
import uploadRoutes from "../modules/upload/upload.routes";

const router = Router();

router.get("/health", (_, res) => {
  sendResponse(res, 200, {
    success: true,
    message: "API is running 🚀",
  });
});

// ---- customer-facing / public --------------------------------------------
router.use("/auth", authRoutes);
router.use("/addresses", addressRoutes);
router.use("/categories", publicCategoryRoutes);
router.use("/brands", publicBrandRoutes);
router.use("/banners", publicBannerRoutes);
router.use("/flash-sales", publicFlashSaleRoutes);
router.use("/options", publicOptionRoutes);
router.use("/products", publicProductRoutes);
router.use("/cart", cartRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/orders", orderRoutes);
router.use("/reviews", reviewRoutes);
router.use("/notifications", notificationRoutes);
router.use("/chat", chatRoutes);

// ---- seller portal (role: SELLER) -----------------------------------------
router.use("/seller/products", sellerProductRoutes);
router.use("/seller/catalog", sellerCatalogResourceRoutes);
router.use("/seller", sellerRoutes);

// ---- staff (roles: SUPER_ADMIN, ADMIN) ------------------------------------
router.use("/admin/users", adminUserRoutes);
router.use("/admin/sellers", adminSellerRoutes);
router.use("/admin/categories", adminCategoryRoutes);
router.use("/admin/brands", adminBrandRoutes);
router.use("/admin/banners", adminBannerRoutes);
router.use("/admin/flash-sales", adminFlashSaleRoutes);
router.use("/admin/options", adminOptionRoutes);
router.use("/admin/option-values", adminOptionValueRoutes);
router.use("/admin/products", adminProductRoutes);
router.use("/admin/catalog", adminCatalogResourceRoutes);
router.use("/admin/orders", adminOrderRoutes);
router.use("/admin/stats", adminStatsRoutes);
router.use("/admin/reviews", adminReviewRoutes);
router.use("/admin/chats", adminChatRoutes);

// Sellers upload product photos too, so this is not under /admin.
router.use("/uploads", uploadRoutes);

export default router;
