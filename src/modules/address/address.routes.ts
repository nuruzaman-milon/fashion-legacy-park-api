import { Router } from "express";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate } from "../../middlewares/auth.middleware";
import * as controller from "./address.controller";
import {
  addressIdSchema,
  createAddressSchema,
  updateAddressSchema,
} from "./address.validation";

const router = Router();

// Addresses are always personal -- no role check, but every query in the
// service is scoped to req.user.id.
router.use(authenticate);

router.get("/", controller.list);

router.post("/", validateRequest(createAddressSchema), controller.create);

router.get("/:id", validateRequest(addressIdSchema), controller.getOne);

router.patch("/:id", validateRequest(updateAddressSchema), controller.update);

router.patch(
  "/:id/default",
  validateRequest(addressIdSchema),
  controller.setDefault,
);

router.delete("/:id", validateRequest(addressIdSchema), controller.remove);

export default router;
