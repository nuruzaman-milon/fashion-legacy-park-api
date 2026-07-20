import { Request } from "express";

/**
 * Reads a single route parameter as a string.
 *
 * Express 5 types `req.params` values as `string | string[]`, because wildcard
 * segments can capture several. Named parameters like `:id` never do, and the
 * Zod schema on the route has already validated it as a string -- this narrows
 * the type without scattering casts through every controller.
 */
export const pathParam = (req: Request, key: string): string => {
  const value = req.params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
};
