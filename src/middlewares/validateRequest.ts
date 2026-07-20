import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

/**
 * Shape every schema is wrapped in. Each key is optional, so a body-only schema
 * stays exactly as it was:
 *
 *   z.object({ body: z.object({ ... }) })
 *   z.object({ params: z.object({ id: z.cuid() }), query: ... })
 *
 * A bare `z.object({ email })` silently fails to match and validates nothing.
 */
type RequestShape = {
  body?: unknown;
  params?: unknown;
  query?: unknown;
};

const validateRequest =
  <T extends RequestShape>(schema: ZodType<T>) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Validation Error",
        errors: result.error.issues,
      });
    }

    // Assign back only what the schema actually declared, so coercions and
    // defaults reach the handler without clobbering the untouched parts.
    if (result.data.body !== undefined) {
      req.body = result.data.body;
    }

    if (result.data.params !== undefined) {
      req.params = result.data.params as Request["params"];
    }

    if (result.data.query !== undefined) {
      // Express 5 made req.query a getter with no setter -- assigning to it
      // throws. The parsed value goes on its own property instead; handlers
      // read req.validatedQuery, never req.query, when a schema declares one.
      req.validatedQuery = result.data.query;
    }

    next();
  };

export default validateRequest;
