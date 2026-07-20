import { z } from "zod";

// Validated once at startup. A missing or weak secret fails loudly here rather
// than silently producing unverifiable tokens at runtime.
//
// NOTE: this reads process.env at import time, so dotenv must already have run.
// server.ts calls dotenv.config() before importing anything that reaches here.
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // 32 chars minimum: a short secret makes HS256 brute-forceable offline.
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  // Short-lived on purpose: access tokens are stateless and cannot be revoked,
  // so the window between a ban and it taking effect is this value.
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),

  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1440), // 24h

  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // Used to build the links inside verification and reset emails.
  CLIENT_URL: z.url().default("http://localhost:3000"),

  // Optional: avatar upload returns 503 unless all three are set, rather than
  // blocking startup. Everything else in the app works without them.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n Invalid environment configuration:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nCheck your .env against .env.example.\n");
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
