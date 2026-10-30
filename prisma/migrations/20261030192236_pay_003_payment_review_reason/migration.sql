-- CreateEnum
CREATE TYPE "PaymentReviewReason" AS ENUM ('AMOUNT_MISMATCH', 'OVERPAID', 'LATE_PAYMENT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentReviewReason" "PaymentReviewReason";
