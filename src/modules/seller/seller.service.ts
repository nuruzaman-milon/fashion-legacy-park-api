import {
  AuthProvider,
  Prisma,
  Role,
  SellerStatus,
  TokenType,
} from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { hashPassword } from "../../utils/password";
import { generateToken, hashToken, minutesFromNow } from "../../utils/token";
import { buildPasswordResetEmail, mailer } from "../../lib/mailer";
import { env } from "../../config/env";
import {
  paginate,
  Paginated,
  toPrismaOrderBy,
  toPrismaPaging,
} from "../../utils/pagination";
import {
  AdminUpdateSellerInput,
  CreateSellerInput,
  ListSellersQuery,
  SellerSelfUpdateInput,
} from "./seller.validation";

const sellerSelect = {
  id: true,
  code: true,
  shopName: true,
  contactName: true,
  contactPhone: true,
  contactEmail: true,
  address: true,
  commissionRate: true,
  status: true,
  bankAccountName: true,
  bankAccountNumber: true,
  bankName: true,
  bankBranch: true,
  bkashNumber: true,
  approvedAt: true,
  createdAt: true,
  user: {
    select: { id: true, name: true, email: true, isActive: true },
  },
} satisfies Prisma.SellerSelect;

type SellerRecord = Prisma.SellerGetPayload<{ select: typeof sellerSelect }>;

const SORTABLE = ["createdAt", "shopName", "code"] as const;

/**
 * Sequential seller code (SLR-0001).
 *
 * Generated inside the caller's transaction so two concurrent creations cannot
 * both read the same count and collide -- `Seller.code` is unique, so a clash
 * would fail the whole create rather than silently duplicate.
 */
const nextSellerCode = async (tx: Prisma.TransactionClient): Promise<string> => {
  const last = await tx.seller.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });

  const lastNumber = last ? Number(last.code.replace(/\D/g, "")) : 0;

  return `SLR-${String(lastNumber + 1).padStart(4, "0")}`;
};

/**
 * Creates the seller's login account and shop record together, then emails a
 * set-your-password link.
 *
 * The account is created with a random unusable password rather than one chosen
 * by the admin: mailing a plaintext password puts a working credential in an
 * inbox and in mail-server logs indefinitely. The seller sets their own.
 */
export const createSeller = async (
  input: CreateSellerInput,
): Promise<SellerRecord> => {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError(409, "An account with this email already exists");
  }

  // Never used to log in -- the invite link is the only way in.
  const unusablePassword = await hashPassword(generateToken(24));
  const inviteToken = generateToken();

  const seller = await prisma.$transaction(async (tx) => {
    const code = await nextSellerCode(tx);

    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: Role.SELLER,
        // The invite link proves control of the address, so a separate
        // verification round would be redundant friction.
        emailVerifiedAt: new Date(),
        accounts: {
          create: {
            provider: AuthProvider.EMAIL,
            password: unusablePassword,
          },
        },
      },
      select: { id: true },
    });

    await tx.verificationToken.create({
      data: {
        userId: user.id,
        identifier: input.email,
        tokenHash: hashToken(inviteToken),
        type: TokenType.PASSWORD_RESET,
        expiresAt: minutesFromNow(env.PASSWORD_RESET_TTL_MINUTES),
      },
    });

    return tx.seller.create({
      data: {
        userId: user.id,
        code,
        shopName: input.shopName,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        address: input.address,
        commissionRate: input.commissionRate,
        bankAccountName: input.bankAccountName,
        bankAccountNumber: input.bankAccountNumber,
        bankName: input.bankName,
        bankBranch: input.bankBranch,
        bkashNumber: input.bkashNumber,
        status: SellerStatus.APPROVED,
        approvedAt: new Date(),
      },
      select: sellerSelect,
    });
  });

  await mailer.send({
    to: input.email,
    ...buildPasswordResetEmail(input.name, inviteToken),
  });

  return seller;
};

export const listSellers = async (
  query: ListSellersQuery,
): Promise<Paginated<SellerRecord>> => {
  const where: Prisma.SellerWhereInput = {
    ...(query.status && { status: query.status }),
    ...(query.search && {
      OR: [
        { shopName: { contains: query.search, mode: "insensitive" } },
        { code: { contains: query.search, mode: "insensitive" } },
        { contactPhone: { contains: query.search } },
        { user: { email: { contains: query.search, mode: "insensitive" } } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.seller.findMany({
      where,
      select: sellerSelect,
      orderBy: toPrismaOrderBy(query, SORTABLE, "createdAt"),
      ...toPrismaPaging(query),
    }),
    prisma.seller.count({ where }),
  ]);

  return paginate(items, total, query);
};

export const getSeller = async (id: string): Promise<SellerRecord> => {
  const seller = await prisma.seller.findUnique({
    where: { id },
    select: sellerSelect,
  });

  if (!seller) {
    throw new ApiError(404, "Seller not found");
  }

  return seller;
};

export const adminUpdateSeller = async (
  id: string,
  input: AdminUpdateSellerInput,
): Promise<SellerRecord> => {
  await getSeller(id);

  return prisma.seller.update({
    where: { id },
    data: input,
    select: sellerSelect,
  });
};

export const updateSellerStatus = async (
  id: string,
  status: SellerStatus,
  actorId: string,
): Promise<SellerRecord> => {
  await getSeller(id);

  const isApproved = status === SellerStatus.APPROVED;

  return prisma.seller.update({
    where: { id },
    data: {
      status,
      ...(isApproved && { approvedAt: new Date(), approvedById: actorId }),
    },
    select: sellerSelect,
  });
};

// ---------------------------------------------------------------------------
// Seller self-service
// ---------------------------------------------------------------------------

export const getOwnSeller = async (userId: string): Promise<SellerRecord> => {
  const seller = await prisma.seller.findUnique({
    where: { userId },
    select: sellerSelect,
  });

  if (!seller) {
    // A SELLER user with no Seller row means the two were created apart, which
    // createSeller's transaction is designed to prevent.
    throw new ApiError(404, "No seller profile is linked to this account");
  }

  return seller;
};

export const updateOwnSeller = async (
  userId: string,
  input: SellerSelfUpdateInput,
): Promise<SellerRecord> => {
  const seller = await getOwnSeller(userId);

  // `input` comes from sellerSelfUpdateSchema, which has no commissionRate,
  // status or code -- Zod strips them, so they cannot arrive here at all.
  return prisma.seller.update({
    where: { id: seller.id },
    data: input,
    select: sellerSelect,
  });
};
