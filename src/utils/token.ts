import crypto from "crypto";

/**
 * Opaque, high-entropy token handed to the user (email links, refresh cookies).
 * 32 bytes = 256 bits, well beyond guessing range.
 */
export const generateToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString("hex");

/**
 * Only the hash is ever stored. A database leak then yields nothing usable:
 * the attacker would need to invert SHA-256 to get a working token.
 *
 * SHA-256 rather than bcrypt is correct here -- these are random 256-bit values,
 * not user-chosen passwords, so there is no dictionary to slow down. Using
 * bcrypt would add latency to every request that presents a refresh token for
 * no security gain.
 */
export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export const minutesFromNow = (minutes: number): Date =>
  new Date(Date.now() + minutes * 60 * 1000);

export const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000);
