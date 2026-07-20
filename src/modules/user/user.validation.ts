import { z } from "zod";
import { Role } from "@prisma/client";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

export const listUsersSchema = z.object({
  query: paginationQuery.extend({
    role: z.enum(Role).optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    isVerified: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  }),
});

export const getUserSchema = z.object({ params: idParam });

// SELLER is deliberately absent. Promoting someone to SELLER here would leave a
// SELLER user with no Seller row, which every seller-scoped query assumes
// exists. Sellers are created through POST /admin/sellers instead.
export const updateRoleSchema = z.object({
  params: idParam,
  body: z.object({
    role: z.enum([Role.SUPER_ADMIN, Role.ADMIN, Role.CUSTOMER]),
  }),
});

export const updateStatusSchema = z.object({
  params: idParam,
  body: z.object({
    isActive: z.boolean(),
  }),
});

export type ListUsersQuery = z.infer<typeof listUsersSchema>["query"];
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>["body"];
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>["body"];
