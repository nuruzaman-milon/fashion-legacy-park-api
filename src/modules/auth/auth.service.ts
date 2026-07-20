import { AuthProvider, Prisma, TokenType, User } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { signAccessToken } from "../../utils/jwt";
import {
  fakeVerifyPassword,
  hashPassword,
  verifyPassword,
} from "../../utils/password";
import {
  daysFromNow,
  generateToken,
  hashToken,
  minutesFromNow,
} from "../../utils/token";
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
  mailer,
} from "../../lib/mailer";
import { deleteImage, uploadImage } from "../../lib/cloudinary";
import { env } from "../../config/env";
import { AuthResult, PublicUser, SessionMeta } from "./auth.interface";
import {
  ChangeEmailInput,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from "./auth.validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toPublicUser = (
  user: Pick<
    User,
    | "id"
    | "name"
    | "email"
    | "phone"
    | "avatar"
    | "role"
    | "emailVerifiedAt"
    | "createdAt"
  >,
): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  avatar: user.avatar,
  role: user.role,
  isEmailVerified: user.emailVerifiedAt !== null,
  createdAt: user.createdAt,
});

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatar: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/**
 * Issues a session: a short-lived JWT plus an opaque refresh token whose hash
 * is what gets stored. The raw refresh token exists only in the response.
 */
const issueSession = async (
  user: { id: string; role: PublicUser["role"] },
  meta: SessionMeta,
): Promise<{ accessToken: string; refreshToken: string }> => {
  const refreshToken = generateToken();

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: daysFromNow(env.REFRESH_TOKEN_TTL_DAYS),
      userAgent: meta.userAgent?.slice(0, 255),
      ipAddress: meta.ipAddress,
    },
  });

  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken,
  };
};

/**
 * Replaces any outstanding tokens of this type, then issues a fresh one.
 * Superseding the old ones means a resent link invalidates the previous email,
 * so an intercepted older message cannot still be used.
 */
const issueVerificationToken = async (
  userId: string,
  identifier: string,
  type: TokenType,
  ttlMinutes: number,
): Promise<string> => {
  const token = generateToken();

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({
      where: { userId, type, consumedAt: null },
    }),
    prisma.verificationToken.create({
      data: {
        userId,
        identifier,
        tokenHash: hashToken(token),
        type,
        expiresAt: minutesFromNow(ttlMinutes),
      },
    }),
  ]);

  return token;
};

const consumeVerificationToken = async (rawToken: string, type: TokenType) => {
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });

  if (
    !record ||
    record.type !== type ||
    record.consumedAt !== null ||
    record.expiresAt < new Date() ||
    !record.userId
  ) {
    throw new ApiError(400, "This link is invalid or has expired");
  }

  return record;
};

// ---------------------------------------------------------------------------
// Registration & verification
// ---------------------------------------------------------------------------

export const register = async (input: RegisterInput): Promise<PublicUser> => {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  // User and its credential row must appear together -- a User with no Account
  // could never log in and could never be registered again either.
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      accounts: {
        create: {
          provider: AuthProvider.EMAIL,
          password: passwordHash,
        },
      },
    },
    select: publicUserSelect,
  });

  const token = await issueVerificationToken(
    user.id,
    user.email,
    TokenType.EMAIL_VERIFICATION,
    env.EMAIL_VERIFICATION_TTL_MINUTES,
  );

  await mailer.send({
    to: user.email,
    ...buildVerificationEmail(user.name, token),
  });

  return toPublicUser(user);
};

export const verifyEmail = async (rawToken: string): Promise<PublicUser> => {
  const record = await consumeVerificationToken(
    rawToken,
    TokenType.EMAIL_VERIFICATION,
  );

  const [, user] = await prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId! },
      data: { emailVerifiedAt: new Date() },
      select: publicUserSelect,
    }),
  ]);

  return toPublicUser(user);
};

/**
 * Always reports success. Confirming whether an address is registered would
 * turn this endpoint into a way to enumerate accounts.
 */
export const resendVerification = async (email: string): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, emailVerifiedAt: true },
  });

  if (!user || user.emailVerifiedAt) {
    return;
  }

  const token = await issueVerificationToken(
    user.id,
    user.email,
    TokenType.EMAIL_VERIFICATION,
    env.EMAIL_VERIFICATION_TTL_MINUTES,
  );

  await mailer.send({
    to: user.email,
    ...buildVerificationEmail(user.name, token),
  });
};

// ---------------------------------------------------------------------------
// Login / session lifecycle
// ---------------------------------------------------------------------------

export const login = async (
  input: LoginInput,
  meta: SessionMeta,
): Promise<AuthResult> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      ...publicUserSelect,
      isActive: true,
      accounts: {
        where: { provider: AuthProvider.EMAIL },
        select: { password: true },
      },
    },
  });

  const passwordHash = user?.accounts[0]?.password;

  if (!user || !passwordHash) {
    // Burn the same time a real bcrypt comparison would, so response latency
    // does not reveal whether the address is registered.
    await fakeVerifyPassword();
    throw new ApiError(401, "Invalid email or password");
  }

  const ok = await verifyPassword(input.password, passwordHash);

  if (!ok) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (!user.isActive) {
    throw new ApiError(403, "This account has been deactivated");
  }

  // Policy: verification is required before login. The message has to be
  // actionable, otherwise a user whose email landed in spam has no way forward.
  if (!user.emailVerifiedAt) {
    throw new ApiError(
      403,
      "Please verify your email address before logging in. Request a new link if you did not receive it.",
    );
  }

  const tokens = await issueSession(user, meta);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return { user: toPublicUser(user), ...tokens };
};

/**
 * Rotation: the presented token is revoked and replaced. A refresh token is
 * therefore single-use, so a stolen one stops working as soon as either party
 * uses it.
 */
export const refresh = async (
  rawToken: string,
  meta: SessionMeta,
): Promise<AuthResult> => {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      user: {
        select: { ...publicUserSelect, isActive: true, passwordChangedAt: true },
      },
    },
  });

  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw new ApiError(401, "Invalid or expired session");
  }

  const { user } = stored;

  if (!user.isActive) {
    throw new ApiError(403, "This account has been deactivated");
  }

  // Belt and braces: changing a password revokes every token, but a token
  // predating the change must never be honoured even if that sweep was missed.
  if (user.passwordChangedAt && stored.createdAt < user.passwordChangedAt) {
    throw new ApiError(401, "Session expired, please log in again");
  }

  const refreshToken = generateToken();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    }),
    prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        expiresAt: daysFromNow(env.REFRESH_TOKEN_TTL_DAYS),
        userAgent: meta.userAgent?.slice(0, 255),
        ipAddress: meta.ipAddress,
      },
    }),
  ]);

  return {
    user: toPublicUser(user),
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken,
  };
};

/** Idempotent: logging out with an already-dead token is still a success. */
export const logout = async (rawToken: string | undefined): Promise<void> => {
  if (!rawToken) return;

  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revoked: false },
    data: { revoked: true },
  });
};

export const logoutAll = async (userId: string): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });
};

// ---------------------------------------------------------------------------
// Password management
// ---------------------------------------------------------------------------

/** Always reports success -- see resendVerification for why. */
export const forgotPassword = async (email: string): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      accounts: {
        where: { provider: AuthProvider.EMAIL },
        select: { id: true },
      },
    },
  });

  // No EMAIL account means a social-only login: there is no password to reset.
  if (!user || user.accounts.length === 0) {
    return;
  }

  const token = await issueVerificationToken(
    user.id,
    user.email,
    TokenType.PASSWORD_RESET,
    env.PASSWORD_RESET_TTL_MINUTES,
  );

  await mailer.send({
    to: user.email,
    ...buildPasswordResetEmail(user.name, token),
  });
};

/**
 * Sets the new password, stamps passwordChangedAt, and kills every session.
 *
 * All three belong in one transaction: a password reset that leaves the
 * attacker's session alive has not actually recovered the account.
 */
export const resetPassword = async (
  rawToken: string,
  newPassword: string,
): Promise<void> => {
  const record = await consumeVerificationToken(
    rawToken,
    TokenType.PASSWORD_RESET,
  );

  const account = await prisma.account.findUnique({
    where: {
      userId_provider: {
        userId: record.userId!,
        provider: AuthProvider.EMAIL,
      },
    },
    select: { id: true },
  });

  if (!account) {
    throw new ApiError(400, "This account has no password to reset");
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  await prisma.$transaction([
    prisma.account.update({
      where: { id: account.id },
      data: { password: passwordHash },
    }),
    prisma.user.update({
      where: { id: record.userId! },
      data: { passwordChangedAt: now },
    }),
    prisma.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId!, revoked: false },
      data: { revoked: true },
    }),
  ]);
};

export const changePassword = async (
  userId: string,
  input: ChangePasswordInput,
): Promise<void> => {
  const account = await prisma.account.findUnique({
    where: {
      userId_provider: { userId, provider: AuthProvider.EMAIL },
    },
    select: { id: true, password: true },
  });

  if (!account?.password) {
    throw new ApiError(400, "This account has no password set");
  }

  const ok = await verifyPassword(input.currentPassword, account.password);

  if (!ok) {
    throw new ApiError(401, "Current password is incorrect");
  }

  const passwordHash = await hashPassword(input.newPassword);
  const now = new Date();

  await prisma.$transaction([
    prisma.account.update({
      where: { id: account.id },
      data: { password: passwordHash },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { passwordChangedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    }),
  ]);
};

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const getMe = async (userId: string): Promise<PublicUser> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return toPublicUser(user);
};

// ---------------------------------------------------------------------------
// Account self-service
// ---------------------------------------------------------------------------

export const updateProfile = async (
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: input,
    select: publicUserSelect,
  });

  return toPublicUser(user);
};

/**
 * Starts an email change by mailing a token to the NEW address.
 *
 * User.email is deliberately NOT written yet. Committing first and verifying
 * afterwards would mean a typo moves the account to an address nobody controls
 * -- unrecoverable, since login and password reset both key on email.
 */
export const requestEmailChange = async (
  userId: string,
  input: ChangeEmailInput,
): Promise<void> => {
  const account = await prisma.account.findUnique({
    where: { userId_provider: { userId, provider: AuthProvider.EMAIL } },
    select: { password: true, user: { select: { name: true, email: true } } },
  });

  if (!account?.password) {
    throw new ApiError(400, "This account has no password set");
  }

  const ok = await verifyPassword(input.password, account.password);

  if (!ok) {
    throw new ApiError(401, "Password is incorrect");
  }

  if (account.user.email === input.newEmail) {
    throw new ApiError(400, "That is already your email address");
  }

  const taken = await prisma.user.findUnique({
    where: { email: input.newEmail },
    select: { id: true },
  });

  if (taken) {
    throw new ApiError(409, "That email address is already in use");
  }

  // identifier carries the PENDING address; the User row keeps the old one
  // until the token is consumed.
  const token = generateToken();

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({
      where: { userId, type: TokenType.EMAIL_CHANGE, consumedAt: null },
    }),
    prisma.verificationToken.create({
      data: {
        userId,
        identifier: input.newEmail,
        tokenHash: hashToken(token),
        type: TokenType.EMAIL_CHANGE,
        expiresAt: minutesFromNow(env.EMAIL_VERIFICATION_TTL_MINUTES),
      },
    }),
  ]);

  await mailer.send({
    to: input.newEmail,
    ...buildVerificationEmail(account.user.name, token),
  });
};

export const verifyNewEmail = async (
  rawToken: string,
): Promise<PublicUser> => {
  const record = await consumeVerificationToken(
    rawToken,
    TokenType.EMAIL_CHANGE,
  );

  // Re-check at consumption time, not just when the change was requested:
  // someone else may have registered the address in the meantime. The
  // User.email unique constraint is the final backstop.
  const taken = await prisma.user.findUnique({
    where: { email: record.identifier },
    select: { id: true },
  });

  if (taken && taken.id !== record.userId) {
    throw new ApiError(409, "That email address is already in use");
  }

  const now = new Date();

  const [, user] = await prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: now },
    }),
    prisma.user.update({
      where: { id: record.userId! },
      data: { email: record.identifier, emailVerifiedAt: now },
      select: publicUserSelect,
    }),
  ]);

  return toPublicUser(user);
};

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

export const listSessions = async (
  userId: string,
  currentRawToken?: string,
): Promise<SessionSummary[]> => {
  const sessions = await prisma.refreshToken.findMany({
    where: { userId, revoked: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      tokenHash: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  const currentHash = currentRawToken ? hashToken(currentRawToken) : null;

  // tokenHash is compared but never returned -- handing it out would let a
  // read-only leak of this response be replayed as a session.
  return sessions.map(({ tokenHash, ...s }) => ({
    ...s,
    isCurrent: currentHash !== null && tokenHash === currentHash,
  }));
};

export const revokeSession = async (
  userId: string,
  sessionId: string,
): Promise<void> => {
  // Scoped by userId: without it, any logged-in user could revoke anyone's
  // session by guessing an id.
  const result = await prisma.refreshToken.updateMany({
    where: { id: sessionId, userId, revoked: false },
    data: { revoked: true },
  });

  if (result.count === 0) {
    throw new ApiError(404, "Session not found");
  }
};

export const setAvatar = async (
  userId: string,
  file: Express.Multer.File,
): Promise<PublicUser> => {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarPublicId: true },
  });

  const uploaded = await uploadImage(file.buffer, "avatars");

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      avatar: uploaded.secure_url,
      avatarPublicId: uploaded.public_id,
    },
    select: publicUserSelect,
  });

  // Delete AFTER the new one is committed. Deleting first would leave the user
  // with no avatar at all if the upload then failed.
  if (current?.avatarPublicId) {
    await deleteImage(current.avatarPublicId);
  }

  return toPublicUser(user);
};

export const removeAvatar = async (userId: string): Promise<PublicUser> => {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarPublicId: true },
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatar: null, avatarPublicId: null },
    select: publicUserSelect,
  });

  if (current?.avatarPublicId) {
    await deleteImage(current.avatarPublicId);
  }

  return toPublicUser(user);
};
