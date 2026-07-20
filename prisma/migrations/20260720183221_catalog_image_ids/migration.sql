-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "logoPublicId" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "bannerPublicId" TEXT,
ADD COLUMN     "iconPublicId" TEXT,
ADD COLUMN     "imagePublicId" TEXT;

