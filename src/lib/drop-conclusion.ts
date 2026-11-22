import type { OrderStatus, PaymentStatus } from "@/generated/prisma/client";

export type BlockingReason =
  | "PAYMENT_PENDING"
  | "PAYMENT_IN_REVIEW"
  | "CHARGEBACK_IN_REVIEW"
  | "LATE_PAYMENT";

export const BLOCKING_REASON_LABELS: Record<BlockingReason, string> = {
  PAYMENT_PENDING: "Pagamento pendente",
  PAYMENT_IN_REVIEW: "Pagamento em análise",
  CHARGEBACK_IN_REVIEW: "Contestação em análise",
  LATE_PAYMENT: "Pagamento recebido após cancelamento",
};

export interface ConclusionOrderState {
  paymentStatus: PaymentStatus;
  status: OrderStatus;
}

// These rules are a recommended interpretation pending client confirmation.
// They must not be widened or relaxed without that confirmation.
const ACKNOWLEDGEABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "PAID",
  "PARTIALLY_REFUNDED",
];

const UNFULFILLED_ORDER_STATUSES: readonly OrderStatus[] = [
  "PENDING",
  "PREPARING",
  "READY_FOR_PICKUP",
];

/**
 * Returns why an order prevents concluding the drop, or null when it does not.
 * A paid order that is CANCELED is a late payment awaiting manual resolution
 * and stays blocking until the provider reports a refund.
 */
export function getBlockingReason(
  order: ConclusionOrderState,
): BlockingReason | null {
  switch (order.paymentStatus) {
    case "PENDING":
      return "PAYMENT_PENDING";
    case "IN_REVIEW":
      return "PAYMENT_IN_REVIEW";
    case "CHARGEBACK_IN_REVIEW":
      return "CHARGEBACK_IN_REVIEW";
    case "PAID":
      return order.status === "CANCELED" ? "LATE_PAYMENT" : null;
    default:
      return null;
  }
}

/** Paid or partially refunded orders that still await fulfilment or pickup. */
export function isAcknowledgeable(order: ConclusionOrderState): boolean {
  return (
    getBlockingReason(order) === null &&
    ACKNOWLEDGEABLE_PAYMENT_STATUSES.includes(order.paymentStatus) &&
    UNFULFILLED_ORDER_STATUSES.includes(order.status)
  );
}

export function classifyOrdersForConclusion<T extends ConclusionOrderState>(
  orders: readonly T[],
): {
  blocking: Array<T & { blockingReason: BlockingReason }>;
  acknowledgeable: T[];
} {
  const blocking: Array<T & { blockingReason: BlockingReason }> = [];
  const acknowledgeable: T[] = [];

  for (const order of orders) {
    const blockingReason = getBlockingReason(order);
    if (blockingReason) {
      blocking.push({ ...order, blockingReason });
    } else if (isAcknowledgeable(order)) {
      acknowledgeable.push(order);
    }
  }

  return { blocking, acknowledgeable };
}
