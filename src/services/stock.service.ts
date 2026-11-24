import type { Prisma } from "@/generated/prisma/client";
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
