import { NotificationType, Prisma, Role } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import {
  paginate,
  Paginated,
  toPrismaPaging,
} from "../../utils/pagination";
import { ListNotificationsQuery } from "./notification.validation";

/**
 * Fan a staff notification out to every active admin, one row each (the
 * model is per-user so read-state is per-admin). Call it with the event's
 * transaction client so a rolled-back order never leaves a ghost "new
 * order" bell behind.
 */
export const notifyAdmins = async (
  client: Prisma.TransactionClient | typeof prisma,
  input: {
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
  },
): Promise<void> => {
  const admins = await client.user.findMany({
    where: {
      role: { in: [Role.SUPER_ADMIN, Role.ADMIN] },
      isActive: true,
    },
    select: { id: true },
  });

  if (admins.length === 0) return;

  await client.notification.createMany({
    data: admins.map((admin) => ({ userId: admin.id, ...input })),
  });
};

// ---------------------------------------------------------------------------
// The caller's own notifications (works for any signed-in user)
// ---------------------------------------------------------------------------

export const listMine = async (
  userId: string,
  query: ListNotificationsQuery,
): Promise<Paginated<unknown>> => {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(query.unread && { isRead: false }),
    ...(query.type && { type: query.type }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toPrismaPaging(query),
    }),
    prisma.notification.count({ where }),
  ]);

  return paginate(items, total, query);
};

/**
 * Total plus a per-type breakdown in one query — the bell badge shows the
 * total while each category tab wears its own count.
 */
export const unreadSummary = async (
  userId: string,
): Promise<{ count: number; byType: Partial<Record<NotificationType, number>> }> => {
  const groups = await prisma.notification.groupBy({
    by: ["type"],
    where: { userId, isRead: false },
    _count: { _all: true },
  });

  const byType: Partial<Record<NotificationType, number>> = {};
  let count = 0;
  for (const group of groups) {
    byType[group.type] = group._count._all;
    count += group._count._all;
  }

  return { count, byType };
};

export const markRead = async (userId: string, id: string): Promise<void> => {
  // Scoped by userId so nobody can mark another user's rows by id.
  const hit = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });

  if (hit.count === 0) {
    throw new ApiError(404, "Notification not found");
  }
};

export const markAllRead = async (userId: string): Promise<number> => {
  const hit = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  return hit.count;
};
