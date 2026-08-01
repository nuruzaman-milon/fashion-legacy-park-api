import { z } from "zod";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

export const notificationIdSchema = z.object({ params: idParam });

export const listNotificationsSchema = z.object({
  query: paginationQuery.extend({
    unread: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  }),
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsSchema
>["query"];
