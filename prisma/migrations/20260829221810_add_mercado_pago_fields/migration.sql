-- DropIndex
DROP INDEX "Order_status_idx";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "mpOrderId" TEXT,
ADD COLUMN     "mpPaymentId" TEXT,
ADD COLUMN     "pixQrCode" TEXT,
ADD COLUMN     "pixQrCodeBase64" TEXT;
