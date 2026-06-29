import { Router } from "express";
import { login, register } from "./auth.controller";
import validateRequest from "../../middlewares/validateRequest";
import { registerSchema } from "./auth.validation";

const router = Router();

// Register
router.post("/register", validateRequest(registerSchema), register);

// Login
router.post("/login", login);

export default router;
