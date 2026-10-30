import type {
  OrderStatus,
  PaymentReviewReason,
  PaymentStatus,
} from "@/generated/prisma/client";
/**
 * Maps a Mercado Pago Orders API status (+ status_detail) to PaymentStatus.
 */
export function mapPaymentStatus(
  mpStatus: string,
  mpStatusDetail?: string,
): PaymentStatus {
  switch (mpStatus) {
    case "pending":
    case "action_required":
      // waiting_payment, waiting_transfer, waiting_capture, pending_challenge,
      // waiting_retry: still unresolved.
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
      // The Orders API reports an expired order as failed/expired.
      return mpStatusDetail === "expired" ? "EXPIRED" : "FAILED";
    case "expired":
      return "EXPIRED";
    case "cancelled":
    case "canceled":
      // ...or as canceled/expired.
      return mpStatusDetail === "expired" ? "EXPIRED" : "CANCELED";
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

/**
 * Payment status only moves forward: a transition is allowed only to a
 * higher rank. Equal rank never transitions, so the first terminal outcome
 * wins (EXPIRED never becomes FAILED, CHARGEBACK_LOST never becomes WON).
 */
const PAYMENT_STATUS_RANK: Record<PaymentStatus, number> = {
  PENDING: 0,
  IN_REVIEW: 1,
  FAILED: 2,
  CANCELED: 2,
  EXPIRED: 2,
  PAID: 3,
  PARTIALLY_REFUNDED: 4,
  REFUNDED: 5,
  CHARGEBACK_IN_REVIEW: 6,
  CHARGEBACK_LOST: 7,
  CHARGEBACK_WON: 7,
};

export interface PaymentSyncInput {
  order: {
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    totalPriceCents: number;
    paymentReviewReason: PaymentReviewReason | null;
  };
  providerStatus: string;
  providerStatusDetail?: string;
  providerTotalCents: number;
  providerPaidCents: number;
}

export interface PaymentSyncDecision {
  /** false = nothing to write (duplicate, stale or regressing notification). */
  apply: boolean;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: OrderStatus;
  reviewReason: PaymentReviewReason | null;
}

/**
 * Single entry point deciding what a provider notification does to an order.
 * Pure: the caller performs the compare-and-set write.
 */
export function resolvePaymentSync(
  input: PaymentSyncInput,
): PaymentSyncDecision {
  const { order } = input;
  const currentRank = PAYMENT_STATUS_RANK[order.paymentStatus];
  let target = mapPaymentStatus(
    input.providerStatus,
    input.providerStatusDetail,
  );
  let reason: PaymentReviewReason | null = null;

  // Amount and late-payment rules apply only on the way into PAID.
  if (target === "PAID" && PAYMENT_STATUS_RANK.PAID > currentRank) {
    const amountMatches =
      input.providerTotalCents === order.totalPriceCents &&
      input.providerPaidCents >= order.totalPriceCents;
    if (!amountMatches) {
      target = "IN_REVIEW";
      reason = "AMOUNT_MISMATCH";
    } else if (order.status === "CANCELED") {
      // Never silently resurrect a canceled order.
      reason = "LATE_PAYMENT";
    } else if (input.providerPaidCents > order.totalPriceCents) {
      reason = "OVERPAID";
    }
  }

  const paymentStatus =
    PAYMENT_STATUS_RANK[target] > currentRank ? target : order.paymentStatus;
  const fulfillmentStatus = resolveFulfillmentStatus(
    order.status,
    paymentStatus,
  );
  // The first flag is sticky; later notifications never overwrite it.
  const reviewReason = order.paymentReviewReason ?? reason;

  return {
    apply:
      paymentStatus !== order.paymentStatus ||
      fulfillmentStatus !== order.status ||
      reviewReason !== order.paymentReviewReason,
    paymentStatus,
    fulfillmentStatus,
    reviewReason,
  };
}
