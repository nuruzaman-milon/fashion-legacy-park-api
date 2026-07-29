-- AlterTable
ALTER TABLE "Banner" ADD COLUMN     "desktopImagePublicId" TEXT,
ADD COLUMN     "eyebrow" TEXT,
ADD COLUMN     "imageAlt" TEXT,
ADD COLUMN     "mobileImagePublicId" TEXT,
ADD COLUMN     "subtitle" TEXT,
ADD COLUMN     "supportingImages" JSONB;

