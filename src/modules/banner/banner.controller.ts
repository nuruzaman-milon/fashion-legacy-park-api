import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as service from "./banner.service";
import { ListBannersQuery } from "./banner.validation";

// ---- public ---------------------------------------------------------------

export const listActive = catchAsync(async (_req: Request, res: Response) => {
  const data = await service.listActiveBanners();

  sendResponse(res, 200, {
    success: true,
    message: "Banners fetched",
    data,
  });
});

// ---- admin ----------------------------------------------------------------

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await service.listBanners(
    req.validatedQuery as ListBannersQuery,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Banners fetched",
    data,
  });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const banner = await service.getById(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Banner fetched",
    data: banner,
  });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const banner = await service.createBanner(req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Banner created",
    data: banner,
  });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const banner = await service.updateBanner(pathParam(req, "id"), req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Banner updated",
    data: banner,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  await service.deleteBanner(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Banner deleted",
  });
});

export const reorder = catchAsync(async (req: Request, res: Response) => {
  await service.reorderBanners(req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Banners reordered",
  });
});
