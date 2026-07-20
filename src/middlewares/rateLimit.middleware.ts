import rateLimit, { ipKeyGenerator, Options } from "express-rate-limit";
import { Request } from "express";
import { isProduction } from "../config/env";

/**
 * Normalises the client IP before it is used as part of a rate-limit key.
 *
 * A raw `req.ip` is wrong for IPv6: a single subscriber typically holds a whole
 * /64, so every request could present a different address and get its own
 * bucket -- the limit would be trivially bypassable. `ipKeyGenerator` collapses
 * the address to its subnet. express-rate-limit refuses to construct a limiter
 * with a custom keyGenerator that skips this.
 */
const ipKey = (req: Request): string => ipKeyGenerator(req.ip ?? "");

const emailKey = (req: Request): string =>
  typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";

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
  keyGenerator: (req: Request) => `${ipKey(req)}:${emailKey(req)}`,
  ...json("Too many requests for this email. Please try again in an hour."),
});

/** Credential stuffing and reset-token brute force. */
export const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req: Request) => `${ipKey(req)}:${emailKey(req)}`,
  ...json("Too many attempts. Please try again in 15 minutes."),
});

/** Blunt backstop across the whole API. */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  ...json("Too many requests. Please slow down."),
});
