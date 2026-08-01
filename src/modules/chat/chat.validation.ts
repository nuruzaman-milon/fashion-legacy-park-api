import { z } from "zod";
import { ConversationStatus } from "@prisma/client";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

export const chatIdSchema = z.object({ params: idParam });

export const sendMessageSchema = z.object({
  body: z.object({
    body: z.string().trim().min(1, "Write a message").max(2000),
  }),
});

/** `after` = ISO timestamp of the newest message the client already has. */
const afterQuery = z.object({
  after: z.coerce.date().optional(),
});

export const pollMessagesSchema = z.object({ query: afterQuery });

export const threadSchema = z.object({ params: idParam, query: afterQuery });

export const listConversationsSchema = z.object({
  query: paginationQuery.extend({
    status: z.enum(ConversationStatus).optional(),
  }),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>["body"];
export type AfterQuery = z.infer<typeof afterQuery>;
export type ListConversationsQuery = z.infer<
  typeof listConversationsSchema
>["query"];
