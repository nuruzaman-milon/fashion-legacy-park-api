-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_variantId_fkey";

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_parentId_fkey";

-- DropForeignKey
ALTER TABLE "FlashSaleItem" DROP CONSTRAINT "FlashSaleItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "FlashSaleItem" DROP CONSTRAINT "FlashSaleItem_variantId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_addressId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_variantId_fkey";

-- DropForeignKey
ALTER TABLE "UserCoupon" DROP CONSTRAINT "UserCoupon_couponId_fkey";

-- DropForeignKey
ALTER TABLE "UserCoupon" DROP CONSTRAINT "UserCoupon_userId_fkey";

-- DropIndex
DROP INDEX "Banner_isActive_idx";

-- DropIndex
DROP INDEX "Banner_sortOrder_idx";

-- DropIndex
DROP INDEX "Brand_slug_idx";

-- DropIndex
DROP INDEX "Category_slug_idx";

-- DropIndex
DROP INDEX "Coupon_code_idx";

-- DropIndex
DROP INDEX "Coupon_isActive_idx";

-- DropIndex
DROP INDEX "FlashSale_endsAt_idx";

-- DropIndex
DROP INDEX "FlashSale_isActive_idx";

-- DropIndex
DROP INDEX "FlashSale_startsAt_idx";

-- DropIndex
DROP INDEX "Notification_isRead_idx";

-- DropIndex
DROP INDEX "Notification_userId_idx";

-- DropIndex
DROP INDEX "Order_orderStatus_idx";

-- DropIndex
DROP INDEX "Order_paymentStatus_idx";

-- DropIndex
DROP INDEX "Order_userId_idx";

-- DropIndex
DROP INDEX "Payment_orderId_key";

-- DropIndex
DROP INDEX "Product_categoryId_idx";

-- DropIndex
DROP INDEX "Product_isFeatured_idx";

-- DropIndex
DROP INDEX "Product_name_idx";

-- DropIndex
DROP INDEX "Product_slug_idx";

-- DropIndex
DROP INDEX "Product_status_idx";

-- DropIndex
DROP INDEX "ProductVariant_isActive_idx";

-- DropIndex
DROP INDEX "ProductVariant_isDefault_idx";

-- DropIndex
DROP INDEX "ProductVariant_productId_idx";

-- DropIndex
DROP INDEX "User_email_idx";

-- DropIndex
DROP INDEX "User_phone_idx";

-- AlterTable
ALTER TABLE "FlashSaleItem" DROP COLUMN "productId";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponDiscountType" "DiscountType",
ADD COLUMN     "couponDiscountValue" DECIMAL(10,2),
ADD COLUMN     "shipAddress" TEXT NOT NULL,
ADD COLUMN     "shipArea" TEXT,
ADD COLUMN     "shipDistrict" TEXT NOT NULL,
ADD COLUMN     "shipDivision" TEXT NOT NULL,
ADD COLUMN     "shipPhone" TEXT NOT NULL,
ADD COLUMN     "shipPostalCode" TEXT,
ADD COLUMN     "shipReceiverName" TEXT NOT NULL,
ADD COLUMN     "shipUpazila" TEXT NOT NULL,
ALTER COLUMN "addressId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "productId" TEXT,
ALTER COLUMN "variantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Setting" ALTER COLUMN "id" SET DEFAULT 'singleton';

-- DropTable
DROP TABLE "UserCoupon";

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_userId_idx" ON "CouponRedemption"("couponId", "userId");

-- CreateIndex
CREATE INDEX "CouponRedemption_userId_idx" ON "CouponRedemption"("userId");

-- CreateIndex
CREATE INDEX "CouponRedemption_orderId_idx" ON "CouponRedemption"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponId_orderId_key" ON "CouponRedemption"("couponId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_provider_key" ON "Account"("userId", "provider");

-- CreateIndex
CREATE INDEX "Banner_isActive_sortOrder_idx" ON "Banner"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Coupon_isActive_expiresAt_idx" ON "Coupon"("isActive", "expiresAt");

-- CreateIndex
CREATE INDEX "FlashSale_isActive_startsAt_endsAt_idx" ON "FlashSale"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_addressId_idx" ON "Order"("addressId");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_orderStatus_createdAt_idx" ON "Order"("orderStatus", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Product_categoryId_status_idx" ON "Product"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Product_status_isFeatured_createdAt_idx" ON "Product"("status", "isFeatured", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_tags_idx" ON "Product" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_isActive_idx" ON "ProductVariant"("productId", "isActive");

-- CreateIndex
CREATE INDEX "Review_userId_idx" ON "Review"("userId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashSaleItem" ADD CONSTRAINT "FlashSaleItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- Raw SQL below: constraints Prisma's DSL cannot express.
-- Keep this block if this migration is ever regenerated.
-- ============================================================================

-- CHECK constraints. The application guards these too, but guards read stale
-- under concurrency: two checkouts both see stock=1, both pass, both decrement.
-- Prisma's {decrement: 1} is atomic so no update is lost -- the row simply
-- lands at -1 and two customers are charged for one unit, silently.
ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_stock_non_negative" CHECK ("stock" >= 0);

ALTER TABLE "Coupon"
  ADD CONSTRAINT "Coupon_within_usage_limit"
  CHECK ("totalUsageLimit" IS NULL OR "usedCount" <= "totalUsageLimit");

ALTER TABLE "FlashSaleItem"
  ADD CONSTRAINT "FlashSaleItem_within_quantity_limit"
  CHECK ("quantityLimit" IS NULL OR "soldCount" <= "quantityLimit");

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- Setting is a singleton. Without this, findFirst() has no ORDER BY, so two
-- rows would let identical carts resolve different shipping charges depending
-- on which row the planner happens to return.
ALTER TABLE "Setting"
  ADD CONSTRAINT "Setting_singleton" CHECK ("id" = 'singleton');

-- Partial unique indexes: at most one "default"/"primary" row per parent.
-- Without these, variants.find(v => v.isDefault) over an unordered result set
-- can return either row -- the category page advertises one price while the
-- product page shows another.
CREATE UNIQUE INDEX "ProductVariant_one_default_per_product"
  ON "ProductVariant"("productId") WHERE "isDefault";

CREATE UNIQUE INDEX "ProductImage_one_primary_per_product"
  ON "ProductImage"("productId") WHERE "isPrimary";

CREATE UNIQUE INDEX "Address_one_default_per_user"
  ON "Address"("userId") WHERE "isDefault";
