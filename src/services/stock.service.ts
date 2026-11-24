import type { Prisma, ReservationStatus } from "@/generated/prisma/client";
import type { AvailabilityFailure, StockDemand } from "@/lib/order-lines";

/** Client received by the callback of `prisma.$transaction`. */
export type StockTransactionClient = Prisma.TransactionClient;

/**
 * Raised when a demand entry cannot be reserved. Throwing is what aborts the
 * surrounding transaction, so no order, reservation or counter change survives.
 */
export class StockReservationError extends Error {
  readonly failure: AvailabilityFailure;

  constructor(failure: AvailabilityFailure) {
    super("Stock could not be reserved.");
    this.name = "StockReservationError";
    this.failure = failure;
  }
}

function outOfStock(demand: StockDemand): StockReservationError {
  return new StockReservationError({
    reason: "OUT_OF_STOCK",
    ...demand.contributions[0].subject,
  });
}

/**
 * Reserves the aggregated demand of one order. Must run inside the transaction
 * that creates the order, so a failure rolls back the order together with every
 * counter already incremented.
 *
 * Each entry is reserved with one conditional UPDATE and must affect exactly
 * one row. The condition is evaluated again by PostgreSQL after a concurrent
 * writer commits, so two buyers of the last unit can never both succeed.
 * Entries are processed in ascending stock item id, the same order for every
 * transaction, so overlapping carts cannot deadlock.
 */
export async function reserveStock(
  tx: StockTransactionClient,
  orderId: string,
  demand: readonly StockDemand[],
): Promise<void> {
  if (demand.length === 0) return;

  const stockItems = await tx.stockItem.findMany({
    where: { stockKey: { in: demand.map((entry) => entry.stockKey) } },
    select: { id: true, stockKey: true },
  });
  const stockItemIdByKey = new Map(
    stockItems.map((item) => [item.stockKey, item.id] as const),
  );

  const entries = demand.map((entry) => {
    const stockItemId = stockItemIdByKey.get(entry.stockKey);
    if (!stockItemId) throw outOfStock(entry);
    return { stockItemId, quantity: entry.quantity, demand: entry };
  });

  entries.sort((a, b) =>
    a.stockItemId < b.stockItemId ? -1 : a.stockItemId > b.stockItemId ? 1 : 0,
  );

  for (const entry of entries) {
    const affectedRows = await tx.$executeRaw`
      UPDATE "StockItem"
      SET "reserved" = "reserved" + ${entry.quantity}::integer
      WHERE "id" = ${entry.stockItemId}
        AND "isAvailable"
        AND "onHand" - "reserved" >= ${entry.quantity}::integer
    `;
    if (affectedRows !== 1) throw outOfStock(entry.demand);
  }

  await tx.stockReservation.createMany({
    data: entries.map(({ stockItemId, quantity }) => ({
      orderId,
      stockItemId,
      quantity,
      status: "RESERVED" as const,
    })),
  });
}

type SettledReservationStatus = Extract<
  ReservationStatus,
  "FINALIZED" | "RELEASED"
>;

/**
 * Moves every RESERVED reservation of the order to `settledStatus` and applies
 * the matching counter change. Only reservations still RESERVED are claimed,
 * so repeating the call (replayed or out-of-order notification) changes
 * nothing. Orders without reservations are a no-op.
 *
 * Reservations are processed in ascending stock item id, the same order used
 * by reserveStock, so concurrent transactions lock stock rows consistently.
 */
async function settleReservations(
  tx: StockTransactionClient,
  orderId: string,
  settledStatus: SettledReservationStatus,
): Promise<void> {
  const reservations = await tx.stockReservation.findMany({
    where: { orderId, status: "RESERVED" },
    select: { id: true, stockItemId: true, quantity: true },
  });

  reservations.sort((a, b) =>
    a.stockItemId < b.stockItemId ? -1 : a.stockItemId > b.stockItemId ? 1 : 0,
  );

  for (const reservation of reservations) {
    const { count } = await tx.stockReservation.updateMany({
      where: { id: reservation.id, status: "RESERVED" },
      data: { status: settledStatus },
    });
    // A concurrent transaction already settled this reservation.
    if (count === 0) continue;

    await tx.stockItem.update({
      where: { id: reservation.stockItemId },
      data:
        settledStatus === "FINALIZED"
          ? {
              onHand: { decrement: reservation.quantity },
              reserved: { decrement: reservation.quantity },
            }
          : { reserved: { decrement: reservation.quantity } },
    });
  }
}

/**
 * Makes the reservations of a paid order final: the units leave `onHand` and
 * `reserved` together. Must run inside the transaction that records the payment.
 */
export async function finalizeReservations(
  tx: StockTransactionClient,
  orderId: string,
): Promise<void> {
  await settleReservations(tx, orderId, "FINALIZED");
}

/**
 * Returns the reserved units of a failed, expired or canceled order to the
 * available stock. Must run inside the transaction that records the payment.
 */
export async function releaseReservations(
  tx: StockTransactionClient,
  orderId: string,
): Promise<void> {
  await settleReservations(tx, orderId, "RELEASED");
}
