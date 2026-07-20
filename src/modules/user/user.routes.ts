import { Router } from "express";
import { Role } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./user.controller";
import {
  getUserSchema,
  listUsersSchema,
  updateRoleSchema,
  updateStatusSchema,
} from "./user.validation";

const router = Router();

// Everything below is staff-only.
router.use(authenticate);

router.get(
  "/",
  authorize(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(listUsersSchema),
  controller.list,
);

router.get(
  "/:id",
  authorize(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(getUserSchema),
  controller.getOne,
);

// SUPER_ADMIN only: if an ADMIN could grant roles, they could promote a second
// account of their own to SUPER_ADMIN and escalate past their own permissions.
router.patch(
  "/:id/role",
  authorize(Role.SUPER_ADMIN),
  validateRequest(updateRoleSchema),
  controller.updateRole,
);

router.patch(
  "/:id/status",
  authorize(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(updateStatusSchema),
  controller.updateStatus,
);

export default router;
