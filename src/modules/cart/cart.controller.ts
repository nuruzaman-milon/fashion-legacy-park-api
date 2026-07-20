import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as service from "./cart.service";

export const get = catchAsync(async (req: Request, res: Response) => {
  const cart = await service.getCart(req.user!.id);

  sendResponse(res, 200, {
    success: true,
    message: "Cart fetched",
    data: cart,
  });
});

export const add = catchAsync(async (req: Request, res: Response) => {
  const cart = await service.addItem(req.user!.id, req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Added to cart",
    data: cart,
  });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const cart = await service.updateItem(
    req.user!.id,
    pathParam(req, "id"),
    req.body.quantity,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Cart updated",
    data: cart,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const cart = await service.removeItem(req.user!.id, pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Item removed",
    data: cart,
  });
});

export const clear = catchAsync(async (req: Request, res: Response) => {
  const cart = await service.clearCart(req.user!.id);

  sendResponse(res, 200, {
    success: true,
    message: "Cart cleared",
    data: cart,
  });
});

export const removeUnavailable = catchAsync(
  async (req: Request, res: Response) => {
    const { removed, cart } = await service.removeUnavailable(req.user!.id);

    sendResponse(res, 200, {
      success: true,
      message: `${removed} unavailable item(s) removed`,
      data: cart,
    });
  },
);

export const moveToWishlist = catchAsync(async (req: Request, res: Response) => {
  const cart = await service.moveToWishlist(req.user!.id, pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Moved to wishlist",
    data: cart,
  });
});
