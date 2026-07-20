import { Role } from "@prisma/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Populated by the `authenticate` middleware. Optional because it is
       * absent on public routes -- guard with `req.user` before use.
       */
      user?: {
        id: string;
        role: Role;
      };

      /**
       * Parsed query string, set by `validateRequest` when the schema declares
       * a `query` key.
       *
       * Express 5 exposes `req.query` as a getter with no setter, so validated
       * and coerced values cannot be written back onto it. Read this instead.
       */
      validatedQuery?: unknown;
    }
  }
}

export {};
