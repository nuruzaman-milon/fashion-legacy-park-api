import rateLimit, { Options } from "express-rate-limit";
import { Request } from "express";
import { isProduction } from "../config/env";

const json = (message: string): Partial<Options> => ({
  standardHeaders: true,
  legacyHeaders: false,
  // Matches the app-wide error contract so clients parse 429 like any other
  // failure instead of hitting express-rate-limit's plain-text default.
  message: { success: false, message },
  // Rate limits make local testing painful and e2e runs flaky. They matter in
  // production, where the abuse actually happens.
  skip: () => !isProduction,
});

/**
 * For endpoints that email an address supplied by the caller.
 *
 * Keyed on IP **and** target email, because either alone leaves a hole: one IP
 * could otherwise spray many addresses, and an attacker rotating IPs could
 * flood a single victim's inbox.
 */
export const mailAbuseLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  keyGenerator: (req: Request) => {
    const email =
      typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
    return `${req.ip}:${email}`;
  },
  ...json("Too many requests for this email. Please try again in an hour."),
});

/** Credential stuffing and reset-token brute force. */
export const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req: Request) => {
    const email =
      typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
    return `${req.ip}:${email}`;
  },
  ...json("Too many attempts. Please try again in 15 minutes."),
});

/** Blunt backstop across the whole API. */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  ...json("Too many requests. Please slow down."),
});
