import { Router } from "express";
import { sendResponse } from "../utils/response";
import authRoutes from "../modules/auth/auth.routes";

const router = Router();

router.get("/health", (_, res) => {
  sendResponse(res, 200, {
    success: true,
    message: "API is running 🚀",
  });
});

router.use("/auth", authRoutes);

export default router;
