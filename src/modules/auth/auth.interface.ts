import { Role } from "@prisma/client";

/** Shape returned to clients. Never includes the password hash. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: Role;
  isEmailVerified: boolean;
  createdAt: Date;
}

/** Login / refresh result. The refresh token goes into an httpOnly cookie. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: PublicUser;
}

/** Recorded on the session row so a user can identify their own devices. */
export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}
