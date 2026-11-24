import type {
  Order,
  PaymentMethod,
  PaymentStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getMercadoPagoOrder,
  ORDER_SEARCH_MAX_WINDOW_MS,
  searchMercadoPagoOrdersByExternalReference,
  type MercadoPagoOrderDetails,
} from "@/services/mercadopago.service";
import {
  abandonUnpaidOrder,
  syncOrderPayment,
  type SyncOutcome,
} from "@/services/payment-sync.service";

const MINUTE_MS = 60_000;

// Implementation defaults, not requirements.
/** Pending orders younger than this are left to the webhook (30-minute Pix expiry plus margin). */
export const STALE_PENDING_THRESHOLD_MINUTES = 45;
/** An order with no provider record is abandoned only after this age. */
export const ABANDONED_ORDER_THRESHOLD_MINUTES = 60;
/** Orders examined per run; calls are sequential to respect provider limits. */
export const RECONCILIATION_BATCH_SIZE = 50;
/** A provider order is created after the local one, never before; the lead only absorbs clock skew. */
const SEARCH_WINDOW_LEAD_MS = 5 * MINUTE_MS;

const RECONCILABLE_PAYMENT_STATUSES: PaymentStatus[] = ["PENDING", "IN_REVIEW"];

export type ReconciliationOutcome =
  | "synced"
  | "abandoned"
  | "still_pending"
  | "awaiting_abandonment"
  | "provider_order_missing"
  | "search_window_exceeded"
  | "conflict";

export interface ReconciliationSummary {
  examined: number;
  outcomes: Record<ReconciliationOutcome | "failed", number>;
  /** Orders whose provider state is still pending or in review after the lookup. */
  stalePending: Array<{ orderId: string; paymentMethod: PaymentMethod }>;
  failures: Array<{ orderId: string; reason: string }>;
}

type ReconcilableOrder = Pick<
  Order,
  "id" | "accessToken" | "mpOrderId" | "paymentMethod" | "createdAt"
>;

function outcomeFromSync(outcome: SyncOutcome): ReconciliationOutcome {
  switch (outcome) {
    case "updated":
      return "synced";
    case "unchanged":
      return "still_pending";
    case "conflict":
      return "conflict";
    case "not_found":
      throw new Error(
        "Local order not found while applying the provider state.",
      );
  }
}

function buildSearchWindow(createdAt: Date, now: Date) {
  const from = new Date(createdAt.getTime() - SEARCH_WINDOW_LEAD_MS);
  if (now.getTime() - from.getTime() > ORDER_SEARCH_MAX_WINDOW_MS) return null;
  return { from, to: now };
}

async function linkProviderOrder(
  orderId: string,
  providerOrder: MercadoPagoOrderDetails,
): Promise<void> {
  const paymentId = providerOrder.payments[0]?.paymentId;
  // Persisted even when the sync later finds nothing to change, so the next
  // run reads the order directly by its provider id.
  await prisma.order.updateMany({
    where: { id: orderId, mpOrderId: null },
    data: {
      mpOrderId: providerOrder.orderId,
      ...(paymentId ? { mpPaymentId: paymentId } : {}),
    },
  });
}

/**
 * Stamps an attempted order so the next batch starts with orders that were
 * attempted least recently; unresolvable orders cannot occupy the batch forever.
 * Resolved orders do not match the filter and are never touched.
 */
async function markReconciliationAttempt(
  orderId: string,
  now: Date,
): Promise<void> {
  await prisma.order.updateMany({
    where: {
      id: orderId,
      paymentStatus: { in: RECONCILABLE_PAYMENT_STATUSES },
    },
    data: { lastPaymentSync: now },
  });
}

async function reconcileOrder(
  order: ReconcilableOrder,
  now: Date,
): Promise<ReconciliationOutcome> {
  if (order.mpOrderId) {
    const providerOrder = await getMercadoPagoOrder(order.mpOrderId);
    if (!providerOrder) return "provider_order_missing";
    return outcomeFromSync(await syncOrderPayment(providerOrder));
  }

  const searchWindow = buildSearchWindow(order.createdAt, now);
  if (!searchWindow) return "search_window_exceeded";

  // Throws when the search fails: a failed search never reaches the
  // abandonment branch below.
  const matches = await searchMercadoPagoOrdersByExternalReference(
    order.id,
    searchWindow,
  );

  if (matches.length > 1) {
    throw new Error(
      "Multiple provider orders share the external reference of the order.",
    );
  }

  if (matches.length === 1) {
    await linkProviderOrder(order.id, matches[0]);
    return outcomeFromSync(await syncOrderPayment(matches[0]));
  }

  // The search succeeded and found nothing. Abandonment additionally requires
  // age: a provider record may still be on its way.
  const ageMs = now.getTime() - order.createdAt.getTime();
  if (ageMs < ABANDONED_ORDER_THRESHOLD_MINUTES * MINUTE_MS) {
    return "awaiting_abandonment";
  }

  return abandonUnpaidOrder(order);
}

export async function reconcileStalePayments(
  now: Date = new Date(),
): Promise<ReconciliationSummary> {
  const staleBefore = new Date(
    now.getTime() - STALE_PENDING_THRESHOLD_MINUTES * MINUTE_MS,
  );

  // Selection is by payment status only: paid, ready and completed orders can
  // never match, so their fulfilment is never touched.
  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: { in: RECONCILABLE_PAYMENT_STATUSES },
      createdAt: { lt: staleBefore },
    },
    orderBy: [
      { lastPaymentSync: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
    ],
    take: RECONCILIATION_BATCH_SIZE,
    select: {
      id: true,
      accessToken: true,
      mpOrderId: true,
      paymentMethod: true,
      createdAt: true,
    },
  });

  const summary: ReconciliationSummary = {
    examined: orders.length,
    outcomes: {
      synced: 0,
      abandoned: 0,
      still_pending: 0,
      awaiting_abandonment: 0,
      provider_order_missing: 0,
      search_window_exceeded: 0,
      conflict: 0,
      failed: 0,
    },
    stalePending: [],
    failures: [],
  };

  // Sequential on purpose; a failure of one order never stops the batch.
  for (const order of orders) {
    try {
      const outcome = await reconcileOrder(order, now);
      summary.outcomes[outcome] += 1;
      if (outcome === "still_pending") {
        summary.stalePending.push({
          orderId: order.id,
          paymentMethod: order.paymentMethod,
        });
      }
    } catch (error) {
      console.error("Payment reconciliation: order failed", {
        orderId: order.id,
        error,
      });
      summary.outcomes.failed += 1;
      summary.failures.push({
        orderId: order.id,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }

    await markReconciliationAttempt(order.id, now).catch((error) => {
      console.error("Payment reconciliation: attempt stamp failed", {
        orderId: order.id,
        error,
      });
    });
  }

  return summary;
}
