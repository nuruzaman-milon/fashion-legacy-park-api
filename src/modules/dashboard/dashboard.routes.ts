import { Router } from "express";
import { Role } from "@prisma/client";
import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { getStats } from "./dashboard.service";

// Small enough for one file: a single parameterless staff-only read.
export const adminStatsRoutes = Router();

adminStatsRoutes.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

adminStatsRoutes.get(
  "/",
  catchAsync(async (_req: Request, res: Response) => {
    sendResponse(res, 200, {
      success: true,
      message: "Dashboard stats fetched",
      data: await getStats(),
    });
  }),
);
