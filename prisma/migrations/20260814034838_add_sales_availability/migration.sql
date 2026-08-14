-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isAvailable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "isAvailable" BOOLEAN NOT NULL DEFAULT true;
