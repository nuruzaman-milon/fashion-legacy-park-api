import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as service from "./coupon.service";
import { ListCouponsQuery } from "./coupon.validation";

// ---- customer -------------------------------------------------------------

export const preview = catchAsync(async (req: Request, res: Response) => {
  const data = await service.previewCoupon(req.user!.id, req.body.code);

  sendResponse(res, 200, {
    success: true,
    message: "Coupon applies",
    data,
  });
});

// ---- admin ----------------------------------------------------------------

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await service.listCoupons(req.validatedQuery as ListCouponsQuery);

  sendResponse(res, 200, {
    success: true,
    message: "Coupons fetched",
    data,
  });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const coupon = await service.getCouponById(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Coupon fetched",
    data: coupon,
  });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const coupon = await service.createCoupon(req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Coupon created",
    data: coupon,
  });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const coupon = await service.updateCoupon(pathParam(req, "id"), req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Coupon updated",
    data: coupon,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  await service.deleteCoupon(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Coupon deleted",
  });
});
