import { z } from "zod";

// Hard ceiling: without it a client can ask for the entire table in one request.
const MAX_LIMIT = 100;

/**
 * Reusable query shape for list endpoints. Compose it into a route schema:
 *
 *   z.object({ query: paginationQuery.extend({ role: z.enum(Role).optional() }) })
 */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().min(1).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Translates page/limit into the skip/take Prisma expects. */
export const toPrismaPaging = (query: PaginationQuery) => ({
  skip: (query.page - 1) * query.limit,
  take: query.limit,
});

/**
 * Builds the ORDER BY, restricted to an explicit allow-list.
 *
 * The allow-list is the point: passing a raw user-supplied `sortBy` into Prisma
 * lets a caller order by any column, including ones the endpoint never meant to
 * expose (a password hash's ordering leaks information about its value).
 */
export const toPrismaOrderBy = <F extends string>(
  query: PaginationQuery,
  allowed: readonly F[],
  fallback: F,
): Record<string, "asc" | "desc"> => {
  const field =
    query.sortBy && (allowed as readonly string[]).includes(query.sortBy)
      ? query.sortBy
      : fallback;

  return { [field]: query.sortOrder };
};

export const paginate = <T>(
  items: T[],
  total: number,
  query: PaginationQuery,
): Paginated<T> => {
  const totalPages = Math.ceil(total / query.limit) || 1;

  return {
    items,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1,
    },
  };
};
