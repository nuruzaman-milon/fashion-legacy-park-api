import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as service from "./option.service";
import { ListOptionsQuery } from "./option.validation";

// ---- public ---------------------------------------------------------------

export const listActive = catchAsync(async (_req: Request, res: Response) => {
  const options = await service.listActiveOptions();

  sendResponse(res, 200, {
    success: true,
    message: "Options fetched",
    data: options,
  });
});

// ---- admin ----------------------------------------------------------------

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await service.listOptions(req.validatedQuery as ListOptionsQuery);

  sendResponse(res, 200, {
    success: true,
    message: "Options fetched",
    data,
  });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const option = await service.getOption(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Option fetched",
    data: option,
  });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const option = await service.createOption(req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Option created",
    data: option,
  });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const option = await service.updateOption(pathParam(req, "id"), req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Option updated",
    data: option,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  await service.deleteOption(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Option deleted",
  });
});

// ---- values ---------------------------------------------------------------

export const createValue = catchAsync(async (req: Request, res: Response) => {
  const value = await service.createOptionValue(pathParam(req, "id"), req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Option value created",
    data: value,
  });
});

export const updateValue = catchAsync(async (req: Request, res: Response) => {
  const value = await service.updateOptionValue(pathParam(req, "id"), req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Option value updated",
    data: value,
  });
});

export const removeValue = catchAsync(async (req: Request, res: Response) => {
  await service.deleteOptionValue(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Option value deleted",
  });
});
