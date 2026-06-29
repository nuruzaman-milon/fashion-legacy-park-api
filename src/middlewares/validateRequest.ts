import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

const validateRequest =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
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
