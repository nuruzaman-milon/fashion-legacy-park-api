import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as sellerService from "./seller.service";
import { ListSellersQuery } from "./seller.validation";

export const create = catchAsync(async (req: Request, res: Response) => {
  const seller = await sellerService.createSeller(req.body);

  sendResponse(res, 201, {
    success: true,
    message:
      "Seller created. An email with a link to set their password has been sent.",
    data: seller,
  });
});

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await sellerService.listSellers(
    req.validatedQuery as ListSellersQuery,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Sellers fetched",
    data: result,
  });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const seller = await sellerService.getSeller(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Seller fetched",
    data: seller,
  });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const seller = await sellerService.adminUpdateSeller(
    pathParam(req, "id"),
    req.body,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Seller updated",
    data: seller,
  });
});

export const updateStatus = catchAsync(async (req: Request, res: Response) => {
  const seller = await sellerService.updateSellerStatus(
    pathParam(req, "id"),
    req.body.status,
    req.user!.id,
  );

  sendResponse(res, 200, {
    success: true,
    message: `Seller status set to ${seller.status}`,
    data: seller,
  });
});

// ---- seller self-service --------------------------------------------------

export const getMine = catchAsync(async (req: Request, res: Response) => {
  const seller = await sellerService.getOwnSeller(req.user!.id);

  sendResponse(res, 200, {
    success: true,
    message: "Seller profile fetched",
    data: seller,
  });
});

export const updateMine = catchAsync(async (req: Request, res: Response) => {
  const seller = await sellerService.updateOwnSeller(req.user!.id, req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Seller profile updated",
    data: seller,
  });
});
