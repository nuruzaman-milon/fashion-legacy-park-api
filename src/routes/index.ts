import { Router } from "express";
import { sendResponse } from "../utils/response";
import { authRoutes } from "../modules/auth";
import { addressRoutes } from "../modules/address";
import { adminUserRoutes } from "../modules/user";
import { adminSellerRoutes, sellerRoutes } from "../modules/seller";

const router = Router();

router.get("/health", (_, res) => {
  sendResponse(res, 200, {
    success: true,
    message: "API is running 🚀",
  });
});

// Customer-facing
router.use("/auth", authRoutes);
router.use("/addresses", addressRoutes);

// Seller portal (role: SELLER)
router.use("/seller", sellerRoutes);

// Staff (roles: SUPER_ADMIN, ADMIN)
router.use("/admin/users", adminUserRoutes);
router.use("/admin/sellers", adminSellerRoutes);

export default router;
