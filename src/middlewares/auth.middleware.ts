import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma";
import ApiError from "../utils/ApiError";
import catchAsync from "../utils/catchAsync";
import { verifyAccessToken } from "../utils/jwt";

/**
 * Verifies the Bearer access token and loads the current user state.
 *
 * The database round-trip is deliberate. A JWT is a snapshot of the moment it
 * was signed, so without it a banned user keeps full access until their token
 * expires.
 */
export const authenticate = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      throw new ApiError(401, "Authentication required");
    }

    const token = header.slice("Bearer ".length).trim();

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      // Deliberately not distinguishing expired from malformed: the client
      // handles both the same way (refresh, then re-login if that fails).
      throw new ApiError(401, "Invalid or expired token");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
        passwordChangedAt: true,
      },
    });

    if (!user) {
      throw new ApiError(401, "Account no longer exists");
    }

    if (!user.isActive) {
      throw new ApiError(403, "This account has been deactivated");
    }

    // Force logout on password change. Refresh tokens are revoked at the same
    // time, but access tokens are stateless and would otherwise stay valid for
    // their full lifetime -- which is exactly the window an attacker who stole
    // one would still be inside after the victim changes their password.
    //
    // `iat` is whole seconds and rounds down, so a token minted in the same
    // second as the change is rejected too. Erring toward rejection is correct.
    if (
      user.passwordChangedAt &&
      payload.iat * 1000 < user.passwordChangedAt.getTime()
    ) {
      throw new ApiError(401, "Session expired, please log in again");
    }

    req.user = { id: user.id, role: user.role };

    next();
  },
);

/**
 * Role guard. Must run after `authenticate`.
 *
 *   router.post("/", authenticate, authorize("ADMIN", "SUPER_ADMIN"), handler)
 */
export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      // A programming error, not a client error: authorize was mounted without
      // authenticate in front of it.
      return next(
        new ApiError(500, "authorize() used without authenticate() before it"),
      );
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError(403, "You do not have permission to perform this action"),
      );
    }

    next();
  };

/**
 * Blocks an action until the account's email is verified.
 *
 * Login already requires verification, so this is a second line of defence for
 * routes that must never run unverified (checkout, for example) -- and it stays
 * correct if the login policy is ever relaxed.
 */
export const requireVerified = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, "Authentication required");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { emailVerifiedAt: true },
    });

    if (!user?.emailVerifiedAt) {
      throw new ApiError(403, "Please verify your email address first");
    }

    next();
  },
);
