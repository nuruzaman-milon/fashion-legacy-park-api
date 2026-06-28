import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";

export const register = catchAsync(async (req: Request, res: Response) => {
  sendResponse(res, 201, {
    success: true,
    message: "Register API working 🚀",
  });
});

export const login = catchAsync(async (req: Request, res: Response) => {
  sendResponse(res, 200, {
    success: true,
    message: "Login API working 🚀",
  });
});
