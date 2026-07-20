import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as service from "./brand.service";
import { ListBrandsQuery } from "./brand.validation";

// ---- public ---------------------------------------------------------------

export const listActive = catchAsync(async (_req: Request, res: Response) => {
  const brands = await service.listActiveBrands();

  sendResponse(res, 200, {
    success: true,
    message: "Brands fetched",
    data: brands,
  });
});

export const getBySlug = catchAsync(async (req: Request, res: Response) => {
  const brand = await service.getBySlug(pathParam(req, "slug"));

  sendResponse(res, 200, {
    success: true,
    message: "Brand fetched",
    data: brand,
  });
});

// ---- admin ----------------------------------------------------------------

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await service.listBrands(req.validatedQuery as ListBrandsQuery);

  sendResponse(res, 200, {
    success: true,
    message: "Brands fetched",
    data,
  });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const brand = await service.getById(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Brand fetched",
    data: brand,
  });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const brand = await service.createBrand(req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Brand created",
    data: brand,
  });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const brand = await service.updateBrand(pathParam(req, "id"), req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Brand updated",
    data: brand,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const unbranded = await service.deleteBrand(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message:
      unbranded > 0
        ? `Brand deleted. ${unbranded} product(s) are now unbranded.`
        : "Brand deleted",
  });
});
