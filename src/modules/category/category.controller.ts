import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as service from "./category.service";
import { ListCategoriesQuery } from "./category.validation";

// ---- public ---------------------------------------------------------------

export const tree = catchAsync(async (_req: Request, res: Response) => {
  const data = await service.getTree();

  sendResponse(res, 200, {
    success: true,
    message: "Category tree fetched",
    data,
  });
});

export const getBySlug = catchAsync(async (req: Request, res: Response) => {
  const category = await service.getBySlug(pathParam(req, "slug"));

  sendResponse(res, 200, {
    success: true,
    message: "Category fetched",
    data: category,
  });
});

// ---- admin ----------------------------------------------------------------

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await service.listCategories(
    req.validatedQuery as ListCategoriesQuery,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Categories fetched",
    data,
  });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const category = await service.getById(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Category fetched",
    data: category,
  });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const category = await service.createCategory(req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Category created",
    data: category,
  });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const category = await service.updateCategory(pathParam(req, "id"), req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Category updated",
    data: category,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  await service.deleteCategory(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Category deleted",
  });
});

export const reorder = catchAsync(async (req: Request, res: Response) => {
  await service.reorderCategories(req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Categories reordered",
  });
});
