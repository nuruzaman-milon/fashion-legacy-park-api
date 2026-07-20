-- AlterEnum
ALTER TYPE "TokenType" ADD VALUE 'EMAIL_CHANGE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarPublicId" TEXT;

