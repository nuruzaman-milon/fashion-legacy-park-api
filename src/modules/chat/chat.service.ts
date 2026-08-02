import { ConversationStatus, Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { notifyAdmins } from "../notification/notification.service";
import {
  paginate,
  Paginated,
  toPrismaPaging,
} from "../../utils/pagination";
import { ListConversationsQuery } from "./chat.validation";

const messageSelect = {
  id: true,
  body: true,
  isStaff: true,
  isRead: true,
  createdAt: true,
  sender: { select: { id: true, name: true } },
} satisfies Prisma.ChatMessageSelect;

/**
 * One support thread per customer, created on first touch (sellerId stays
 * null until seller chat exists — the service, not an index, enforces
 * uniqueness because NULL rows never collide in Postgres).
 */
const getOrCreateConversation = async (customerId: string) => {
  const existing = await prisma.conversation.findFirst({
    where: { customerId, sellerId: null },
    select: { id: true, status: true },
  });

  if (existing) return existing;

  return prisma.conversation.create({
    data: { customerId },
    select: { id: true, status: true },
  });
};

// ---------------------------------------------------------------------------
// Customer side
// ---------------------------------------------------------------------------

/**
 * The customer's thread since `after` (ms-precision cursor for polling).
 * Fetching IS reading: every staff message returned to the customer is
 * marked read in the same call, so unread state can never go stale.
 */
export const getMyThread = async (customerId: string, after?: Date) => {
  const conversation = await prisma.conversation.findFirst({
    where: { customerId, sellerId: null },
    select: { id: true, status: true },
  });

  if (!conversation) {
    return { conversationId: null, status: null, messages: [] };
  }

  const [messages] = await prisma.$transaction([
    prisma.chatMessage.findMany({
      where: {
        conversationId: conversation.id,
        ...(after && { createdAt: { gt: after } }),
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: messageSelect,
    }),
    prisma.chatMessage.updateMany({
      where: { conversationId: conversation.id, isStaff: true, isRead: false },
      data: { isRead: true },
    }),
  ]);

  return {
    conversationId: conversation.id,
    status: conversation.status,
    messages,
  };
};

/** Staff replies the customer has not seen — the bubble's badge. */
export const myUnreadCount = async (customerId: string): Promise<number> =>
  prisma.chatMessage.count({
    where: {
      conversation: { customerId, sellerId: null },
      isStaff: true,
      isRead: false,
    },
  });

export const sendCustomerMessage = async (
  customerId: string,
  body: string,
) => {
  const conversation = await getOrCreateConversation(customerId);

  return prisma.$transaction(async (tx) => {
    // The first unread message of a burst rings the admin bell; the rest of
    // a rapid-fire "hello?? are you there" volley stays silent.
    const unreadBefore = await tx.chatMessage.count({
      where: {
        conversationId: conversation.id,
        isStaff: false,
        isRead: false,
      },
    });

    const message = await tx.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: customerId,
        body,
      },
      select: messageSelect,
    });

    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: message.createdAt,
        // A closed thread reopens the moment the customer speaks again.
        ...(conversation.status === ConversationStatus.CLOSED && {
          status: ConversationStatus.OPEN,
        }),
      },
    });

    if (unreadBefore === 0) {
      await notifyAdmins(tx, {
        type: "CHAT",
        title: "New chat message",
        message:
          body.length > 80 ? `${body.slice(0, 77)}…` : body,
        link: "/admin/chats",
      });
    }

    return message;
  });
};

// ---------------------------------------------------------------------------
// Admin side
// ---------------------------------------------------------------------------

export const adminListConversations = async (
  query: ListConversationsQuery,
): Promise<Paginated<unknown>> => {
  const where: Prisma.ConversationWhereInput = {
    ...(query.status && { status: query.status }),
    ...(query.search && {
      customer: {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { email: { contains: query.search, mode: "insensitive" } },
        ],
      },
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true,
        status: true,
        lastMessageAt: true,
        customer: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, isStaff: true, createdAt: true },
        },
        _count: {
          select: {
            messages: { where: { isStaff: false, isRead: false } },
          },
        },
      },
      ...toPrismaPaging(query),
    }),
    prisma.conversation.count({ where }),
  ]);

  return paginate(
    items.map((c) => ({
      id: c.id,
      status: c.status,
      lastMessageAt: c.lastMessageAt,
      customer: c.customer,
      lastMessage: c.messages[0] ?? null,
      unreadCount: c._count.messages,
    })),
    total,
    query,
  );
};

/** Thread for staff; fetching marks the customer's messages read. */
export const adminGetThread = async (id: string, after?: Date) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      customer: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  if (!conversation) {
    throw new ApiError(404, "Conversation not found");
  }

  const [messages] = await prisma.$transaction([
    prisma.chatMessage.findMany({
      where: {
        conversationId: id,
        ...(after && { createdAt: { gt: after } }),
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: messageSelect,
    }),
    prisma.chatMessage.updateMany({
      where: { conversationId: id, isStaff: false, isRead: false },
      data: { isRead: true },
    }),
  ]);

  return { ...conversation, messages };
};

export const adminSendMessage = async (
  adminId: string,
  conversationId: string,
  body: string,
) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });

  if (!conversation) {
    throw new ApiError(404, "Conversation not found");
  }

  return prisma.$transaction(async (tx) => {
    const message = await tx.chatMessage.create({
      data: {
        conversationId,
        senderId: adminId,
        isStaff: true,
        body,
      },
      select: messageSelect,
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });

    return message;
  });
};

export const adminSetStatus = async (
  id: string,
  status: ConversationStatus,
) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!conversation) {
    throw new ApiError(404, "Conversation not found");
  }

  return prisma.conversation.update({
    where: { id },
    data: { status },
    select: { id: true, status: true },
  });
};
