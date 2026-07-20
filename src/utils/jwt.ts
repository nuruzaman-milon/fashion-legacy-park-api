import jwt, { SignOptions } from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export interface DecodedAccessToken extends AccessTokenPayload {
  iat: number;
  exp: number;
}

/**
 * Only the ACCESS token is a JWT. Refresh tokens are opaque random values
 * stored (hashed) in the RefreshToken table -- that is what makes a session
 * server-revocable, which a self-contained JWT can never be.
 */
export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
  });

/** Throws on an invalid or expired token -- callers must handle that. */
export const verifyAccessToken = (token: string): DecodedAccessToken =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as DecodedAccessToken;
