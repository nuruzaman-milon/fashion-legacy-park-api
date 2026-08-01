import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as service from "./order.service";
import {
  AdminListOrdersQuery,
  ListMyOrdersQuery,
} from "./order.validation";

// ---- customer -------------------------------------------------------------

export const place = catchAsync(async (req: Request, res: Response) => {
  const order = await service.placeOrder(req.user!.id, req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Order placed",
    data: order,
  });
});

export const listMine = catchAsync(async (req: Request, res: Response) => {
  const data = await service.listMyOrders(
    req.user!.id,
    req.validatedQuery as ListMyOrdersQuery,
  );

  sendResponse(res, 200, { success: true, message: "Orders fetched", data });
});

export const getMine = catchAsync(async (req: Request, res: Response) => {
  const order = await service.getMyOrder(req.user!.id, pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Order fetched",
    data: order,
  });
});

export const cancelMine = catchAsync(async (req: Request, res: Response) => {
  const order = await service.cancelMyOrder(
    req.user!.id,
    pathParam(req, "id"),
    req.body?.reason,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Order cancelled",
    data: order,
  });
});

// ---- admin ----------------------------------------------------------------

export const adminList = catchAsync(async (req: Request, res: Response) => {
  const data = await service.adminListOrders(
    req.validatedQuery as AdminListOrdersQuery,
  );

  sendResponse(res, 200, { success: true, message: "Orders fetched", data });
});

export const adminGet = catchAsync(async (req: Request, res: Response) => {
  const order = await service.adminGetOrder(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Order fetched",
    data: order,
  });
});

export const adminSetStatus = catchAsync(async (req: Request, res: Response) => {
  const order = await service.adminUpdateStatus(
    req.user!.id,
    pathParam(req, "id"),
    req.body,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Order status updated",
    data: order,
  });
});
