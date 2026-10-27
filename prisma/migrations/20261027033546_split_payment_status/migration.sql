/*
  Warnings:

- The values [PAID] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
- A unique constraint covering the columns `[idempotencyKey]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
- A unique constraint covering the columns `[key]` on the table `rateLimit` will be added. If there are existing duplicate values, this will fail.
- Changed the type of `lastRequest` on the `rateLimit` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
*/

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'PAID', 'FAILED', 'EXPIRED', 'CANCELED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CHARGEBACK_IN_REVIEW', 'CHARGEBACK_LOST', 'CHARGEBACK_WON');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "lastPaymentSync" TIMESTAMP(3),
ADD COLUMN     "paidAmount" INTEGER,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "providerStatusDetail" TEXT;

-- Custom Data Backfill
UPDATE "Order" SET "paymentStatus" = 'PAID' WHERE "status" IN ('PAID', 'READY_FOR_PICKUP', 'COMPLETED');
UPDATE "Order" SET "paymentStatus" = 'CANCELED' WHERE "status" = 'CANCELED';
UPDATE "Order" SET "status" = 'PENDING' WHERE "status" = 'PAID';

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELED');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable (Other tables)
ALTER TABLE "rateLimit" DROP COLUMN "lastRequest",
ADD COLUMN     "lastRequest" DOUBLE PRECISION NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");
