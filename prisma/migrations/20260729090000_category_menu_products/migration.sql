-- CreateTable
CREATE TABLE "CategoryMenuProduct" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryMenuProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryMenuProduct_categoryId_sortOrder_idx" ON "CategoryMenuProduct"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMenuProduct_categoryId_productId_key" ON "CategoryMenuProduct"("categoryId", "productId");

-- AddForeignKey
ALTER TABLE "CategoryMenuProduct" ADD CONSTRAINT "CategoryMenuProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMenuProduct" ADD CONSTRAINT "CategoryMenuProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

