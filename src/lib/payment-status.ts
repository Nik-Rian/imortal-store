import type { OrderStatus, PaymentStatus } from "@/generated/prisma/client";

/**
 * Maps a Mercado Pago Orders API status (+ status_detail) to PaymentStatus.
 */
export function mapPaymentStatus(
  mpStatus: string,
  mpStatusDetail?: string,
): PaymentStatus {
  switch (mpStatus) {
    case "pending":
      return "PENDING";
    case "processing":
    case "in_process":
      return "IN_REVIEW";
    case "processed":
    case "approved":
      // The Orders API reports a partial refund as processed/partially_refunded.
      return mpStatusDetail === "partially_refunded"
        ? "PARTIALLY_REFUNDED"
        : "PAID";
    case "failed":
    case "rejected":
      return "FAILED";
    case "expired":
      return "EXPIRED";
    case "cancelled":
    case "canceled":
      return "CANCELED";
    case "partially_refunded":
      return "PARTIALLY_REFUNDED";
    case "refunded":
      return "REFUNDED";
    case "charged_back":
      if (mpStatusDetail === "in_process") return "CHARGEBACK_IN_REVIEW";
      if (mpStatusDetail === "reimbursed") return "CHARGEBACK_WON";
      return "CHARGEBACK_LOST";
    default:
      return "PENDING";
  }
}

const CANCELING_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "FAILED",
  "CANCELED",
  "EXPIRED",
  "REFUNDED",
  "CHARGEBACK_LOST",
];

/**
 * Fulfillment only changes while nothing has been prepared yet (PENDING).
 * Once an order is READY_FOR_PICKUP or COMPLETED, payment changes (refund,
 * chargeback) never touch it.
 */
export function resolveFulfillmentStatus(
  current: OrderStatus,
  nextPayment: PaymentStatus,
): OrderStatus {
  if (
    current === "PENDING" &&
    CANCELING_PAYMENT_STATUSES.includes(nextPayment)
  ) {
    return "CANCELED";
  }
  return current;
}
