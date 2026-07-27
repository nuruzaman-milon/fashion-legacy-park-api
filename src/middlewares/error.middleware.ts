import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { ZodError } from "zod";
import ApiError from "../utils/ApiError";
import { isProduction } from "../config/env";

interface ErrorBody {
  success: false;
  message: string;
  code?: string;
  errors?: unknown;
  stack?: string;
}

/**
 * Translates every error shape the app can produce into one response contract.
 *
 * Anything unrecognised becomes a generic 500 with the real message logged but
 * NOT returned -- database errors in particular leak table and column names.
 */
const globalErrorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // Required: Express only treats a 4-arity function as an error handler.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  let statusCode = 500;
  let message = "Internal Server Error";
  let code: string | undefined;
  let errors: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation Error";
    errors = err.issues;
  } else if (err instanceof TokenExpiredError) {
    statusCode = 401;
    message = "Token has expired";
  } else if (err instanceof JsonWebTokenError) {
    statusCode = 401;
    message = "Invalid token";
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        // Unique constraint. `target` names the offending column(s).
        const target = (err.meta?.target as string[] | undefined)?.join(", ");
        statusCode = 409;
        message = target
          ? `A record with this ${target} already exists`
          : "This record already exists";
        break;
      }
      case "P2025":
        statusCode = 404;
        message = "Record not found";
        break;
      case "P2003":
        statusCode = 409;
        message = "This record is still referenced by other data";
        break;
      default:
        statusCode = 400;
        message = "Database request failed";
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = "Invalid data supplied";
  }

  // Log the real error for anything the client is not being told about.
  if (statusCode >= 500) {
    console.error("[error]", err);
  }

  const body: ErrorBody = { success: false, message };

  if (code !== undefined) {
    body.code = code;
  }

  if (errors !== undefined) {
    body.errors = errors;
  }

  if (!isProduction && err instanceof Error && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
};

/** Mounted after every route, so an unmatched path is a JSON 404, not HTML. */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

export default globalErrorHandler;
