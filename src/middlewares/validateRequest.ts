import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

// Schemas must be shaped as z.object({ body: ... }) — the generic enforces it.
// A bare ZodSchema types result.data as `unknown`, so `.body` fails to compile.
const validateRequest =
  <T extends { body: unknown }>(schema: ZodType<T>) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Validation Error",
        errors: result.error.issues,
      });
    }

    req.body = result.data.body;

    next();
  };

export default validateRequest;
