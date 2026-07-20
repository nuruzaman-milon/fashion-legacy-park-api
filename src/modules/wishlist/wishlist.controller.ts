import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as service from "./wishlist.service";
import * as cartService from "../cart/cart.service";
import { ListWishlistQuery } from "./wishlist.service";

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await service.listWishlist(
    req.user!.id,
    req.validatedQuery as ListWishlistQuery,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Wishlist fetched",
    data,
  });
});

export const add = catchAsync(async (req: Request, res: Response) => {
  const entry = await service.addToWishlist(req.user!.id, req.body.productId);

  sendResponse(res, 201, {
    success: true,
    message: "Added to wishlist",
    data: entry,
  });
});

export const toggle = catchAsync(async (req: Request, res: Response) => {
  const result = await service.toggleWishlist(
    req.user!.id,
    pathParam(req, "productId"),
  );

  sendResponse(res, 200, {
    success: true,
    message: result.wishlisted ? "Added to wishlist" : "Removed from wishlist",
    data: result,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  await service.removeFromWishlist(req.user!.id, pathParam(req, "productId"));

  sendResponse(res, 200, {
    success: true,
    message: "Removed from wishlist",
  });
});

export const moveToCart = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const productId = pathParam(req, "productId");

  // Guard first: without this a crafted request could add any variant in the
  // catalogue by pairing it with a product the customer has wishlisted.
  await service.assertVariantBelongsToProduct(productId, req.body.variantId);

  // Reuses the cart service so every stock and availability check applies here
  // too -- duplicating them would mean this path drifts out of sync.
  const cart = await cartService.addItem(userId, {
    variantId: req.body.variantId,
    quantity: req.body.quantity,
  });

  // Only after the cart accepted it. Removing first would lose the entry if the
  // item turned out to be out of stock.
  await service.removeAfterMove(userId, productId);

  sendResponse(res, 200, {
    success: true,
    message: "Moved to cart",
    data: cart,
  });
});
