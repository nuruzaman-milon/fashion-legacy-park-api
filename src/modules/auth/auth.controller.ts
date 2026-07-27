import { CookieOptions, Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import ApiError from "../../utils/ApiError";
import { pathParam } from "../../utils/pathParam";
import { env, isProduction } from "../../config/env";
import { SessionMeta } from "./auth.interface";
import * as authService from "./auth.service";

const REFRESH_COOKIE = "refreshToken";

// httpOnly keeps the refresh token out of reach of JavaScript, so an XSS bug
// cannot exfiltrate it. The path scoping means it is only ever sent to the
// endpoints that actually need it, not attached to every API call.
//
// SameSite=Lax assumes the browser reaches this API same-site: directly on
// localhost in development, and through the frontend's /api/v1/* rewrite proxy
// (or an api.<same-domain> subdomain) in production. Lax also CSRF-protects
// the cookie. Only a deployment where the API sits on an unrelated domain
// would need "none" — and third-party cookie blocking breaks that setup in
// Safari anyway, so it is deliberately not supported.
const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  path: "/api/v1/auth",
});

const sessionMeta = (req: Request): SessionMeta => ({
  userAgent: req.headers["user-agent"],
  ipAddress: req.ip,
});

export const register = catchAsync(async (req: Request, res: Response) => {
  const user = await authService.register(req.body);

  // No tokens here on purpose: this deployment requires a verified email
  // before login, so handing back a session would contradict that.
  sendResponse(res, 201, {
    success: true,
    message:
      "Account created. Check your email for a verification link to activate it.",
    data: user,
  });
});

export const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const user = await authService.verifyEmail(req.body.token);

  sendResponse(res, 200, {
    success: true,
    message: "Email verified. You can now log in.",
    data: user,
  });
});

export const resendVerification = catchAsync(
  async (req: Request, res: Response) => {
    await authService.resendVerification(req.body.email);

    // Deliberately unconditional -- see the service for why.
    sendResponse(res, 200, {
      success: true,
      message:
        "If that email belongs to an unverified account, a new link is on its way.",
    });
  },
);

export const login = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken, ...result } = await authService.login(
    req.body,
    sessionMeta(req),
  );

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  sendResponse(res, 200, {
    success: true,
    message: "Logged in successfully",
    data: result,
  });
});

export const refresh = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];

  if (!token) {
    throw new ApiError(401, "No active session");
  }

  const { refreshToken, ...result } = await authService.refresh(
    token,
    sessionMeta(req),
  );

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  sendResponse(res, 200, {
    success: true,
    message: "Session refreshed",
    data: result,
  });
});

export const logout = catchAsync(async (req: Request, res: Response) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);

  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });

  sendResponse(res, 200, {
    success: true,
    message: "Logged out successfully",
  });
});

export const logoutAll = catchAsync(async (req: Request, res: Response) => {
  await authService.logoutAll(req.user!.id);

  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });

  sendResponse(res, 200, {
    success: true,
    message: "Logged out from all devices",
  });
});

export const forgotPassword = catchAsync(
  async (req: Request, res: Response) => {
    await authService.forgotPassword(req.body.email);

    sendResponse(res, 200, {
      success: true,
      message:
        "If that email belongs to an account, a reset link is on its way.",
    });
  },
);

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.token, req.body.password);

  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });

  sendResponse(res, 200, {
    success: true,
    message: "Password reset. Please log in with your new password.",
  });
});

export const changePassword = catchAsync(
  async (req: Request, res: Response) => {
    await authService.changePassword(req.user!.id, req.body);

    res.clearCookie(REFRESH_COOKIE, {
      ...refreshCookieOptions(),
      maxAge: undefined,
    });

    sendResponse(res, 200, {
      success: true,
      message:
        "Password changed. All sessions have been logged out, please log in again.",
    });
  },
);

export const me = catchAsync(async (req: Request, res: Response) => {
  const user = await authService.getMe(req.user!.id);

  sendResponse(res, 200, {
    success: true,
    message: "Profile fetched",
    data: user,
  });
});

// ---------------------------------------------------------------------------
// Account self-service
// ---------------------------------------------------------------------------

export const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const user = await authService.updateProfile(req.user!.id, req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Profile updated",
    data: user,
  });
});

export const changeEmail = catchAsync(async (req: Request, res: Response) => {
  await authService.requestEmailChange(req.user!.id, req.body);

  sendResponse(res, 200, {
    success: true,
    message:
      "Verification link sent to the new address. Your email changes once you confirm it.",
  });
});

export const verifyNewEmail = catchAsync(
  async (req: Request, res: Response) => {
    const user = await authService.verifyNewEmail(req.body.token);

    sendResponse(res, 200, {
      success: true,
      message: "Email address updated",
      data: user,
    });
  },
);

export const sessions = catchAsync(async (req: Request, res: Response) => {
  const list = await authService.listSessions(
    req.user!.id,
    req.cookies?.[REFRESH_COOKIE],
  );

  sendResponse(res, 200, {
    success: true,
    message: "Sessions fetched",
    data: list,
  });
});

export const revokeSession = catchAsync(async (req: Request, res: Response) => {
  await authService.revokeSession(req.user!.id, pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Session revoked",
  });
});

export const setAvatar = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, "No image file was provided");
  }

  const user = await authService.setAvatar(req.user!.id, req.file);

  sendResponse(res, 200, {
    success: true,
    message: "Avatar updated",
    data: user,
  });
});

export const removeAvatar = catchAsync(async (req: Request, res: Response) => {
  const user = await authService.removeAvatar(req.user!.id);

  sendResponse(res, 200, {
    success: true,
    message: "Avatar removed",
    data: user,
  });
});
