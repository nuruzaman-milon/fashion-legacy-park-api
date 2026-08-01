import { Router } from "express";
import { Request, Response } from "express";
import { ConversationStatus, Role } from "@prisma/client";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as service from "./chat.service";
import {
  AfterQuery,
  chatIdSchema,
  listConversationsSchema,
  ListConversationsQuery,
  pollMessagesSchema,
  sendMessageSchema,
  threadSchema,
} from "./chat.validation";

// ---- /api/v1/chat  (the signed-in customer's support thread) --------------

export const chatRoutes = Router();

chatRoutes.use(authenticate);

chatRoutes.get(
  "/",
  validateRequest(pollMessagesSchema),
  catchAsync(async (req: Request, res: Response) => {
    const { after } = req.validatedQuery as AfterQuery;
    const data = await service.getMyThread(req.user!.id, after);
    sendResponse(res, 200, { success: true, message: "Thread fetched", data });
  }),
);

chatRoutes.get(
  "/unread-count",
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, 200, {
      success: true,
      message: "Unread count fetched",
      data: { count: await service.myUnreadCount(req.user!.id) },
    });
  }),
);

chatRoutes.post(
  "/messages",
  validateRequest(sendMessageSchema),
  catchAsync(async (req: Request, res: Response) => {
    const message = await service.sendCustomerMessage(
      req.user!.id,
      req.body.body,
    );
    sendResponse(res, 201, { success: true, message: "Sent", data: message });
  }),
);

// ---- /api/v1/admin/chats ---------------------------------------------------

export const adminChatRoutes = Router();

adminChatRoutes.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

adminChatRoutes.get(
  "/",
  validateRequest(listConversationsSchema),
  catchAsync(async (req: Request, res: Response) => {
    const data = await service.adminListConversations(
      req.validatedQuery as ListConversationsQuery,
    );
    sendResponse(res, 200, {
      success: true,
      message: "Conversations fetched",
      data,
    });
  }),
);

adminChatRoutes.get(
  "/:id",
  validateRequest(threadSchema),
  catchAsync(async (req: Request, res: Response) => {
    const { after } = req.validatedQuery as AfterQuery;
    const data = await service.adminGetThread(pathParam(req, "id"), after);
    sendResponse(res, 200, { success: true, message: "Thread fetched", data });
  }),
);

adminChatRoutes.post(
  "/:id/messages",
  validateRequest(sendMessageSchema),
  catchAsync(async (req: Request, res: Response) => {
    const message = await service.adminSendMessage(
      req.user!.id,
      pathParam(req, "id"),
      req.body.body,
    );
    sendResponse(res, 201, { success: true, message: "Sent", data: message });
  }),
);

adminChatRoutes.patch(
  "/:id/close",
  validateRequest(chatIdSchema),
  catchAsync(async (req: Request, res: Response) => {
    const data = await service.adminSetStatus(
      pathParam(req, "id"),
      ConversationStatus.CLOSED,
    );
    sendResponse(res, 200, { success: true, message: "Closed", data });
  }),
);
