import bcrypt from "bcrypt";
import { env } from "../config/env";

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, env.BCRYPT_ROUNDS);

export const verifyPassword = (
  plain: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(plain, hash);

// Computed once, lazily, so startup is not blocked by a bcrypt round.
let dummyHash: Promise<string> | null = null;

/**
 * Burns roughly the same time a real password check would.
 *
 * Login must take the same time whether or not the account exists. Returning
 * early on "user not found" skips the bcrypt round, and that timing difference
 * is measurable over the network -- it turns the login endpoint into an oracle
 * for discovering which email addresses are registered.
 */
export const fakeVerifyPassword = async (): Promise<void> => {
  if (!dummyHash) {
    dummyHash = bcrypt.hash("not-a-real-password", env.BCRYPT_ROUNDS);
  }
  await bcrypt.compare("not-a-real-password-either", await dummyHash);
};
