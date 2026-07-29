import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as service from "./flash-sale.service";
import { ListFlashSalesQuery } from "./flash-sale.validation";

// ---- public ---------------------------------------------------------------

export const active = catchAsync(async (_req: Request, res: Response) => {
  const data = await service.getActiveSale();

  // data is null when no sale is live -- 200 on purpose, the homepage simply
  // hides the section, it is not an error state.
  sendResponse(res, 200, {
    success: true,
    message: data ? "Active flash sale fetched" : "No flash sale is live",
    data,
  });
});

// ---- admin ----------------------------------------------------------------

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await service.listSales(
    req.validatedQuery as ListFlashSalesQuery,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Flash sales fetched",
    data,
  });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const sale = await service.getSaleById(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Flash sale fetched",
    data: sale,
  });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const sale = await service.createSale(req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Flash sale created",
    data: sale,
  });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const sale = await service.updateSale(pathParam(req, "id"), req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Flash sale updated",
    data: sale,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  await service.deleteSale(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Flash sale deleted",
  });
});

export const setRules = catchAsync(async (req: Request, res: Response) => {
  const data = await service.setRules(pathParam(req, "id"), req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Flash sale rules updated",
    data,
  });
});

export const setItems = catchAsync(async (req: Request, res: Response) => {
  const data = await service.setItems(pathParam(req, "id"), req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Flash sale items updated",
    data,
  });
});
