import { z } from "zod";

// Every schema is wrapped in { body: ... } because validateRequest parses
// { body: req.body } and reassigns req.body = result.data.body. A bare
// z.object({ email }) silently fails to validate.

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters") // bcrypt truncates past 72
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
    "Password must contain uppercase, lowercase, number and special character",
  );

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
    email: z.email("Invalid email address").toLowerCase().trim(),
    password,
    phone: z
      .string()
      .regex(/^01[3-9]\d{8}$/, "Enter a valid Bangladeshi mobile number")
      .optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.email("Invalid email address").toLowerCase().trim(),
    password: z.string().min(1, "Password is required"),
  }),
});

export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required"),
  }),
});

export const resendVerificationSchema = z.object({
  body: z.object({
    email: z.email("Invalid email address").toLowerCase().trim(),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.email("Invalid email address").toLowerCase().trim(),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required"),
    password,
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: password,
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>["body"];
export type LoginInput = z.infer<typeof loginSchema>["body"];
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>["body"];
export type ResendVerificationInput = z.infer<
  typeof resendVerificationSchema
>["body"];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>["body"];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>["body"];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];

// ---------------------------------------------------------------------------
// Account self-service
// ---------------------------------------------------------------------------

// Email, role and isActive are deliberately absent. Email changes go through
// changeEmailSchema so the new address is proven reachable first; role and
// status are staff-only.
export const updateProfileSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
      phone: z
        .string()
        .regex(/^01[3-9]\d{8}$/, "Enter a valid Bangladeshi mobile number")
        .nullable(),
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, "Nothing to update"),
});

export const changeEmailSchema = z.object({
  body: z.object({
    newEmail: z.email("Invalid email address").toLowerCase().trim(),
    // Re-authenticate: without this, a hijacked session could quietly move the
    // account to an attacker-controlled address.
    password: z.string().min(1, "Password is required"),
  }),
});

export const verifyNewEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required"),
  }),
});

export const sessionIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>["body"];
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>["body"];
