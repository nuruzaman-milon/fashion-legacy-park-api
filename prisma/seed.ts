import dotenv from "dotenv";

dotenv.config();

import { AuthProvider, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

/**
 * Creates the first SUPER_ADMIN.
 *
 * Without this there is no way into the admin surface at all: registration
 * always produces a CUSTOMER, and changing a role requires an existing
 * SUPER_ADMIN. The only alternative would be editing the database by hand.
 *
 * Idempotent -- safe to re-run. Re-running does NOT reset an existing admin's
 * password, so it cannot be used to hijack the account by re-seeding.
 */
const main = async () => {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Super Admin";

  if (!email || !password) {
    console.error(
      "\n  SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env\n",
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("\n  SEED_ADMIN_PASSWORD must be at least 8 characters\n");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (existing) {
    if (existing.role !== Role.SUPER_ADMIN) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: Role.SUPER_ADMIN },
      });
      console.log(`  promoted existing user to SUPER_ADMIN: ${email}`);
    } else {
      console.log(`  SUPER_ADMIN already exists: ${email} (password unchanged)`);
    }
    return;
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: Role.SUPER_ADMIN,
      // Pre-verified: an admin created from the server console has already
      // proven control of the address, and login is gated on verification.
      emailVerifiedAt: new Date(),
      accounts: {
        create: {
          provider: AuthProvider.EMAIL,
          password: await bcrypt.hash(password, rounds),
        },
      },
    },
    select: { id: true, email: true },
  });

  console.log(`  created SUPER_ADMIN: ${user.email}`);
};

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
