-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'FINALIZED', 'RELEASED');

-- CreateTable "ProductSize" first
CREATE TABLE "ProductSize" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSize_pkey" PRIMARY KEY ("id")
);

-- Move sizes from ProductVariant to ProductSize
INSERT INTO "ProductSize" ("id", "productId", "size", "isAvailable", "sortOrder", "createdAt", "updatedAt")
SELECT "id", "productId", "size", "isAvailable", "sortOrder", "createdAt", "updatedAt"
FROM "ProductVariant";

-- DropForeignKey & Indexes
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_variantId_fkey";
DROP INDEX "OrderItem_variantId_idx";
DROP INDEX "ProductVariant_productId_size_key";

-- Add columns first
ALTER TABLE "OrderItem" ADD COLUMN "sizeLabel" TEXT,
ADD COLUMN "variantName" TEXT;

-- Snapshot the size label for existing orders
UPDATE "OrderItem" SET "sizeLabel" = "variantSize";

-- Now safe to drop old columns
ALTER TABLE "OrderItem" DROP COLUMN "variantId",
DROP COLUMN "variantSize";

-- Add configuration flags
ALTER TABLE "Product" ADD COLUMN "controlStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hasSizes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hasVariants" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "showVariantsInStore" BOOLEAN NOT NULL DEFAULT true;

-- Clear ProductVariant before changing its schema
-- (Old variant data represented sizes and is now safely in ProductSize)
DELETE FROM "ProductVariant";

-- Drop size, add name & image
ALTER TABLE "ProductVariant" DROP COLUMN "size",
ADD COLUMN "image" TEXT,
ADD COLUMN "name" TEXT NOT NULL;

-- CreateTable StockItem
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "sizeId" TEXT,
    "stockKey" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- Prevent negative stock at the database level
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_onHand_check" CHECK ("onHand" >= 0);
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_reserved_check" CHECK ("reserved" >= 0);

-- CreateTable StockReservation
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductSize_productId_size_key" ON "ProductSize"("productId", "size");
CREATE UNIQUE INDEX "StockItem_stockKey_key" ON "StockItem"("stockKey");
CREATE INDEX "StockItem_productId_idx" ON "StockItem"("productId");
CREATE INDEX "StockItem_variantId_idx" ON "StockItem"("variantId");
CREATE INDEX "StockItem_sizeId_idx" ON "StockItem"("sizeId");
CREATE INDEX "StockReservation_orderId_idx" ON "StockReservation"("orderId");
CREATE INDEX "StockReservation_stockItemId_idx" ON "StockReservation"("stockItemId");
CREATE UNIQUE INDEX "ProductVariant_productId_name_key" ON "ProductVariant"("productId", "name");

-- AddForeignKey
ALTER TABLE "ProductSize" ADD CONSTRAINT "ProductSize_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "ProductSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
