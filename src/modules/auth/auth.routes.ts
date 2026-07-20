import { Router } from "express";
import validateRequest from "../../middlewares/validateRequest";
import { authenticate } from "../../middlewares/auth.middleware";
import {
  credentialLimiter,
  mailAbuseLimiter,
} from "../../middlewares/rateLimit.middleware";
import { uploadImage } from "../../middlewares/upload.middleware";
import * as controller from "./auth.controller";
import {
  changeEmailSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sessionIdSchema,
  updateProfileSchema,
  verifyEmailSchema,
  verifyNewEmailSchema,
} from "./auth.validation";

const router = Router();

// ---- public --------------------------------------------------------------

router.post("/register", validateRequest(registerSchema), controller.register);

router.post(
  "/verify-email",
  validateRequest(verifyEmailSchema),
  controller.verifyEmail,
);

// Not optional given login requires a verified email: without this, anyone
// whose verification mail is lost or filtered is permanently locked out.
// Rate limited because it mails an address the caller supplies.
router.post(
  "/resend-verification",
  mailAbuseLimiter,
  validateRequest(resendVerificationSchema),
  controller.resendVerification,
);

router.post(
  "/login",
  credentialLimiter,
  validateRequest(loginSchema),
  controller.login,
);

// Reads the refresh token from its httpOnly cookie, not the body.
router.post("/refresh", controller.refresh);

router.post("/logout", controller.logout);

router.post(
  "/forgot-password",
  mailAbuseLimiter,
  validateRequest(forgotPasswordSchema),
  controller.forgotPassword,
);

router.post(
  "/reset-password",
  credentialLimiter,
  validateRequest(resetPasswordSchema),
  controller.resetPassword,
);

// Consumes an EMAIL_CHANGE token. Public because the link is opened from the
// new inbox, which may not be the browser holding the session.
router.post(
  "/verify-new-email",
  validateRequest(verifyNewEmailSchema),
  controller.verifyNewEmail,
);

// ---- authenticated -------------------------------------------------------

router.use(authenticate);

router.get("/me", controller.me);

router.patch("/me", validateRequest(updateProfileSchema), controller.updateProfile);

router.post("/me/avatar", uploadImage.single("avatar"), controller.setAvatar);

router.delete("/me/avatar", controller.removeAvatar);

router.post(
  "/change-email",
  validateRequest(changeEmailSchema),
  controller.changeEmail,
);

router.post(
  "/change-password",
  validateRequest(changePasswordSchema),
  controller.changePassword,
);

router.get("/sessions", controller.sessions);

router.delete(
  "/sessions/:id",
  validateRequest(sessionIdSchema),
  controller.revokeSession,
);

router.post("/logout-all", controller.logoutAll);

export default router;
