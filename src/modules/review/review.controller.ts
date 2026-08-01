import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as service from "./review.service";
import { AdminListReviewsQuery } from "./review.validation";

export const create = catchAsync(async (req: Request, res: Response) => {
  const review = await service.createReview(req.user!.id, req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Review submitted for moderation",
    data: review,
  });
});

export const adminList = catchAsync(async (req: Request, res: Response) => {
  const data = await service.adminListReviews(
    req.validatedQuery as AdminListReviewsQuery,
  );

  sendResponse(res, 200, { success: true, message: "Reviews fetched", data });
});

export const setStatus = catchAsync(async (req: Request, res: Response) => {
  const review = await service.setReviewStatus(
    pathParam(req, "id"),
    req.body.status,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Review status updated",
    data: review,
  });
});

export const reply = catchAsync(async (req: Request, res: Response) => {
  const review = await service.replyToReview(
    pathParam(req, "id"),
    req.body.reply,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Reply saved",
    data: review,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  await service.deleteReview(pathParam(req, "id"));

  sendResponse(res, 200, { success: true, message: "Review deleted" });
});
