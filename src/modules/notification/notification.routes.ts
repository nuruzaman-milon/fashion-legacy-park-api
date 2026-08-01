import { Router } from "express";
import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate } from "../../middlewares/auth.middleware";
import * as service from "./notification.service";
import {
  listNotificationsSchema,
  notificationIdSchema,
  ListNotificationsQuery,
} from "./notification.validation";

// Deliberately NOT admin-scoped: rows are per-user, so the same endpoints
// serve customer notifications the day the storefront grows a bell.
export const notificationRoutes = Router();

notificationRoutes.use(authenticate);

notificationRoutes.get(
  "/",
  validateRequest(listNotificationsSchema),
  catchAsync(async (req: Request, res: Response) => {
    const data = await service.listMine(
      req.user!.id,
      req.validatedQuery as ListNotificationsQuery,
    );
    sendResponse(res, 200, {
      success: true,
      message: "Notifications fetched",
      data,
    });
  }),
);

notificationRoutes.get(
  "/unread-count",
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, 200, {
      success: true,
      message: "Unread count fetched",
      data: { count: await service.unreadCount(req.user!.id) },
    });
  }),
);

notificationRoutes.patch(
  "/:id/read",
  validateRequest(notificationIdSchema),
  catchAsync(async (req: Request, res: Response) => {
    await service.markRead(req.user!.id, pathParam(req, "id"));
    sendResponse(res, 200, { success: true, message: "Marked as read" });
  }),
);

notificationRoutes.post(
  "/read-all",
  catchAsync(async (req: Request, res: Response) => {
    const count = await service.markAllRead(req.user!.id);
    sendResponse(res, 200, {
      success: true,
      message: "All marked as read",
      data: { count },
    });
  }),
);
