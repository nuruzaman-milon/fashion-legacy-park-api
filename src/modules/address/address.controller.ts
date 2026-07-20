import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as addressService from "./address.service";

export const list = catchAsync(async (req: Request, res: Response) => {
  const addresses = await addressService.listAddresses(req.user!.id);

  sendResponse(res, 200, {
    success: true,
    message: "Addresses fetched",
    data: addresses,
  });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const address = await addressService.getAddress(
    req.user!.id,
    pathParam(req, "id"),
  );

  sendResponse(res, 200, {
    success: true,
    message: "Address fetched",
    data: address,
  });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const address = await addressService.createAddress(req.user!.id, req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Address added",
    data: address,
  });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const address = await addressService.updateAddress(
    req.user!.id,
    pathParam(req, "id"),
    req.body,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Address updated",
    data: address,
  });
});

export const setDefault = catchAsync(async (req: Request, res: Response) => {
  const address = await addressService.setDefaultAddress(
    req.user!.id,
    pathParam(req, "id"),
  );

  sendResponse(res, 200, {
    success: true,
    message: "Default address updated",
    data: address,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  await addressService.deleteAddress(req.user!.id, pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Address deleted",
  });
});
