import { z } from "zod";
import { NotificationType } from "@prisma/client";
import { paginationQuery } from "../../utils/pagination";

const idParam = z.object({ id: z.string().min(1) });

export const notificationIdSchema = z.object({ params: idParam });

export const listNotificationsSchema = z.object({
  query: paginationQuery.extend({
    unread: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    // Serves the bell's per-category tabs.
    type: z.enum(NotificationType).optional(),
  }),
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsSchema
>["query"];
