import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as userService from "./user.service";
import { ListUsersQuery } from "./user.validation";

export const list = catchAsync(async (req: Request, res: Response) => {
  // req.validatedQuery, not req.query -- Express 5 makes req.query read-only,
  // so validateRequest cannot write coerced values back onto it.
  const result = await userService.listUsers(
    req.validatedQuery as ListUsersQuery,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Users fetched",
    data: result,
  });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.getUser(pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "User fetched",
    data: user,
  });
});

export const updateRole = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.updateRole(
    req.user!.id,
    pathParam(req, "id"),
    req.body.role,
  );

  sendResponse(res, 200, {
    success: true,
    message: `Role updated to ${user.role}`,
    data: user,
  });
});

export const updateStatus = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.updateStatus(
    req.user!.id,
    pathParam(req, "id"),
    req.body.isActive,
  );

  sendResponse(res, 200, {
    success: true,
    message: user.isActive ? "Account activated" : "Account deactivated",
    data: user,
  });
});
