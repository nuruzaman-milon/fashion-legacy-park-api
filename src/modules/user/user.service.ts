import { Prisma, Role } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import {
  paginate,
  Paginated,
  toPrismaOrderBy,
  toPrismaPaging,
} from "../../utils/pagination";
import { ListUsersQuery } from "./user.validation";

const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatar: true,
  role: true,
  isActive: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type AdminUser = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

const SORTABLE = ["createdAt", "name", "email", "lastLoginAt"] as const;

export const listUsers = async (
  query: ListUsersQuery,
): Promise<Paginated<AdminUser>> => {
  const where: Prisma.UserWhereInput = {
    ...(query.role && { role: query.role }),
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    ...(query.isVerified !== undefined && {
      emailVerifiedAt: query.isVerified ? { not: null } : null,
    }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: adminUserSelect,
      orderBy: toPrismaOrderBy(query, SORTABLE, "createdAt"),
      ...toPrismaPaging(query),
    }),
    prisma.user.count({ where }),
  ]);

  return paginate(items, total, query);
};

export const getUser = async (id: string): Promise<AdminUser> => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: adminUserSelect,
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
};

/**
 * Guards against the ways an admin surface can lock everyone out or be used to
 * escalate privileges. Each of these is only reachable through this endpoint,
 * so the checks belong here rather than in the controller.
 */
const assertRoleChangeAllowed = async (
  actorId: string,
  target: { id: string; role: Role },
  nextRole: Role,
) => {
  // 1. Self-demotion is unrecoverable without database access.
  if (actorId === target.id) {
    throw new ApiError(400, "You cannot change your own role");
  }

  // 2. A SELLER's account is bound to a Seller row; moving them out of the role
  //    would orphan it. Deactivate or suspend the seller instead.
  if (target.role === Role.SELLER) {
    throw new ApiError(
      400,
      "Seller roles are managed through the seller endpoints",
    );
  }

  // 3. Removing the last SUPER_ADMIN leaves nobody who can appoint another.
  if (target.role === Role.SUPER_ADMIN && nextRole !== Role.SUPER_ADMIN) {
    const remaining = await prisma.user.count({
      where: { role: Role.SUPER_ADMIN, isActive: true },
    });

    if (remaining <= 1) {
      throw new ApiError(400, "Cannot demote the last active super admin");
    }
  }
};

export const updateRole = async (
  actorId: string,
  targetId: string,
  nextRole: Role,
): Promise<AdminUser> => {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true },
  });

  if (!target) {
    throw new ApiError(404, "User not found");
  }

  await assertRoleChangeAllowed(actorId, target, nextRole);

  // No token invalidation needed: `authenticate` reads the role from the
  // database on every request, so this takes effect immediately. The `role`
  // claim inside the JWT is informational only.
  return prisma.user.update({
    where: { id: targetId },
    data: { role: nextRole },
    select: adminUserSelect,
  });
};

export const updateStatus = async (
  actorId: string,
  targetId: string,
  isActive: boolean,
): Promise<AdminUser> => {
  if (actorId === targetId) {
    throw new ApiError(400, "You cannot change your own account status");
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, isActive: true },
  });

  if (!target) {
    throw new ApiError(404, "User not found");
  }

  if (!isActive && target.role === Role.SUPER_ADMIN) {
    const remaining = await prisma.user.count({
      where: { role: Role.SUPER_ADMIN, isActive: true },
    });

    if (remaining <= 1) {
      throw new ApiError(400, "Cannot deactivate the last active super admin");
    }
  }

  // Deactivating must also kill outstanding sessions. `authenticate` already
  // rejects an inactive user, but leaving live refresh tokens behind means the
  // session silently resurrects the moment the account is re-enabled.
  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: targetId },
      data: { isActive },
      select: adminUserSelect,
    }),
    ...(isActive
      ? []
      : [
          prisma.refreshToken.updateMany({
            where: { userId: targetId, revoked: false },
            data: { revoked: true },
          }),
        ]),
  ]);

  return user;
};
