import { Router } from "express";
import { sendResponse } from "../utils/response";

const router = Router();

router.get("/health", (_, res) => {
  sendResponse(res, 200, {
    success: true,
    message: "API is running 🚀",
  });
});

export default router;
