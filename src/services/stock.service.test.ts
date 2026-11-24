import type { FailureSubject, StockDemand } from "@/lib/order-lines";
import { describe, expect, it, vi } from "vitest";
import {
  finalizeReservations,
  releaseReservations,
  reserveStock,
  StockReservationError,
  type StockTransactionClient,
} from "./stock.service";

function makeSubject(overrides: Partial<FailureSubject> = {}): FailureSubject {
  return {
    productId: "prod-1",
    productName: "Camisa",
    variantId: null,
    variantName: null,
    sizeId: "size-m",
    sizeLabel: "M",
    bundleName: null,
    ...overrides,
  };
}

function makeDemand(
  stockKey: string,
  quantity: number,
  subject: Partial<FailureSubject> = {},
): StockDemand {
  return {
    stockKey,
    quantity,
    contributions: [{ quantity, subject: makeSubject(subject) }],
  };
}

function makeTransaction({
  stockItems,
  affectedRows,
}: {
  stockItems: { id: string; stockKey: string }[];
  affectedRows: number[];
}) {
  const executeRaw = vi.fn();
  for (const affected of affectedRows) {
    executeRaw.mockResolvedValueOnce(affected);
  }
  const tx = {
    stockItem: { findMany: vi.fn().mockResolvedValue(stockItems) },
    stockReservation: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $executeRaw: executeRaw,
  };
  return { tx, client: tx as unknown as StockTransactionClient };
}

const STOCK_ITEMS = [
  { id: "item-a", stockKey: "key-a" },
  { id: "item-b", stockKey: "key-b" },
  { id: "item-c", stockKey: "key-c" },
];

describe("reserveStock", () => {
  it("does nothing when the order has no stock demand", async () => {
    const { tx, client } = makeTransaction({
      stockItems: [],
      affectedRows: [],
    });

    await reserveStock(client, "order-1", []);

    expect(tx.stockItem.findMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.stockReservation.createMany).not.toHaveBeenCalled();
  });

  it("reserves in ascending stock item id whatever the order of the demand", async () => {
    const { tx, client } = makeTransaction({
      stockItems: STOCK_ITEMS,
      affectedRows: [1, 1, 1],
    });

    await reserveStock(client, "order-1", [
      makeDemand("key-c", 3),
      makeDemand("key-a", 1),
      makeDemand("key-b", 2),
    ]);

    // Tagged template call: [strings, quantity, stockItemId, quantity].
    const calls = tx.$executeRaw.mock.calls;
    expect(calls.map((call) => call[2])).toEqual([
      "item-a",
      "item-b",
      "item-c",
    ]);
    expect(calls.map((call) => call[1])).toEqual([1, 2, 3]);
    expect(calls.map((call) => call[3])).toEqual([1, 2, 3]);
  });

  it("sends the identifiers and quantities as parameters, never inside the SQL text", async () => {
    const { tx, client } = makeTransaction({
      stockItems: STOCK_ITEMS,
      affectedRows: [1],
    });

    await reserveStock(client, "order-1", [makeDemand("key-a", 7)]);

    const [strings] = tx.$executeRaw.mock.calls[0] as [string[]];
    const sql = strings.join("?");
    expect(sql).not.toContain("item-a");
    expect(sql).not.toMatch(/\b7\b/);
    expect(sql).toContain('"isAvailable"');
    expect(sql).toContain('"onHand" - "reserved" >=');
  });

  it("writes one RESERVED reservation per demand entry in the same order", async () => {
    const { tx, client } = makeTransaction({
      stockItems: STOCK_ITEMS,
      affectedRows: [1, 1],
    });

    await reserveStock(client, "order-1", [
      makeDemand("key-b", 2),
      makeDemand("key-a", 1),
    ]);

    expect(tx.stockReservation.createMany).toHaveBeenCalledTimes(1);
    expect(tx.stockReservation.createMany).toHaveBeenCalledWith({
      data: [
        {
          orderId: "order-1",
          stockItemId: "item-a",
          quantity: 1,
          status: "RESERVED",
        },
        {
          orderId: "order-1",
          stockItemId: "item-b",
          quantity: 2,
          status: "RESERVED",
        },
      ],
    });
  });

  it("signals the rollback and names the product when an update affects no row", async () => {
    const { tx, client } = makeTransaction({
      stockItems: STOCK_ITEMS,
      affectedRows: [1, 0],
    });

    const error = await reserveStock(client, "order-1", [
      makeDemand("key-a", 1),
      makeDemand("key-b", 1, {
        productId: "prod-2",
        productName: "Boné",
        variantId: "var-blue",
        variantName: "Azul",
        sizeId: null,
        sizeLabel: null,
      }),
    ]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StockReservationError);
    expect((error as StockReservationError).failure).toMatchObject({
      reason: "OUT_OF_STOCK",
      productId: "prod-2",
      productName: "Boné",
      variantName: "Azul",
    });
    expect(tx.stockReservation.createMany).not.toHaveBeenCalled();
  });

  it("stops at the first update that fails", async () => {
    const { tx, client } = makeTransaction({
      stockItems: STOCK_ITEMS,
      affectedRows: [0],
    });

    await expect(
      reserveStock(client, "order-1", [
        makeDemand("key-a", 1),
        makeDemand("key-b", 1),
      ]),
    ).rejects.toBeInstanceOf(StockReservationError);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("reports the bundle when the exhausted stock belongs to a component", async () => {
    const { client } = makeTransaction({
      stockItems: STOCK_ITEMS,
      affectedRows: [0],
    });

    const error = await reserveStock(client, "order-1", [
      makeDemand("key-a", 1, { bundleName: "Kit Calouro" }),
    ]).catch((caught: unknown) => caught);

    expect((error as StockReservationError).failure).toMatchObject({
      bundleName: "Kit Calouro",
    });
  });

  it("fails without updating anything when a stock row does not exist", async () => {
    const { tx, client } = makeTransaction({
      stockItems: [{ id: "item-a", stockKey: "key-a" }],
      affectedRows: [],
    });

    await expect(
      reserveStock(client, "order-1", [
        makeDemand("key-a", 1),
        makeDemand("key-missing", 1),
      ]),
    ).rejects.toBeInstanceOf(StockReservationError);

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.stockReservation.createMany).not.toHaveBeenCalled();
  });
});

function makeSettlementTransaction(
  reservations: { id: string; stockItemId: string; quantity: number }[],
  claimed: number[] = reservations.map(() => 1),
) {
  const updateMany = vi.fn();
  for (const count of claimed) {
    updateMany.mockResolvedValueOnce({ count });
  }
  const tx = {
    stockReservation: {
      findMany: vi.fn().mockResolvedValue(reservations),
      updateMany,
    },
    stockItem: { update: vi.fn().mockResolvedValue({}) },
  };
  return { tx, client: tx as unknown as StockTransactionClient };
}

describe("finalizeReservations", () => {
  it("marks the reservation FINALIZED and decreases onHand and reserved by its quantity", async () => {
    const { tx, client } = makeSettlementTransaction([
      { id: "res-1", stockItemId: "item-a", quantity: 3 },
    ]);

    await finalizeReservations(client, "order-1");

    expect(tx.stockReservation.updateMany).toHaveBeenCalledWith({
      where: { id: "res-1", status: "RESERVED" },
      data: { status: "FINALIZED" },
    });
    expect(tx.stockItem.update).toHaveBeenCalledWith({
      where: { id: "item-a" },
      data: { onHand: { decrement: 3 }, reserved: { decrement: 3 } },
    });
  });

  it("reads only the RESERVED reservations of the given order", async () => {
    const { tx, client } = makeSettlementTransaction([]);

    await finalizeReservations(client, "order-1");

    expect(tx.stockReservation.findMany).toHaveBeenCalledWith({
      where: { orderId: "order-1", status: "RESERVED" },
      select: { id: true, stockItemId: true, quantity: true },
    });
  });

  it("settles in ascending stock item id whatever the read order", async () => {
    const { tx, client } = makeSettlementTransaction([
      { id: "res-c", stockItemId: "item-c", quantity: 1 },
      { id: "res-a", stockItemId: "item-a", quantity: 1 },
    ]);

    await finalizeReservations(client, "order-1");

    expect(
      tx.stockItem.update.mock.calls.map((call) => call[0].where.id),
    ).toEqual(["item-a", "item-c"]);
  });

  it("leaves the counters alone when another transaction already settled the reservation", async () => {
    const { tx, client } = makeSettlementTransaction(
      [{ id: "res-1", stockItemId: "item-a", quantity: 3 }],
      [0],
    );

    await finalizeReservations(client, "order-1");

    expect(tx.stockItem.update).not.toHaveBeenCalled();
  });

  it("does nothing for an order without reservations", async () => {
    const { tx, client } = makeSettlementTransaction([]);

    await finalizeReservations(client, "order-1");

    expect(tx.stockReservation.updateMany).not.toHaveBeenCalled();
    expect(tx.stockItem.update).not.toHaveBeenCalled();
  });
});

describe("releaseReservations", () => {
  it("marks the reservation RELEASED and decreases only reserved", async () => {
    const { tx, client } = makeSettlementTransaction([
      { id: "res-1", stockItemId: "item-a", quantity: 2 },
    ]);

    await releaseReservations(client, "order-1");

    expect(tx.stockReservation.updateMany).toHaveBeenCalledWith({
      where: { id: "res-1", status: "RESERVED" },
      data: { status: "RELEASED" },
    });
    expect(tx.stockItem.update).toHaveBeenCalledWith({
      where: { id: "item-a" },
      data: { reserved: { decrement: 2 } },
    });
  });

  it("leaves the counters alone when another transaction already settled the reservation", async () => {
    const { tx, client } = makeSettlementTransaction(
      [{ id: "res-1", stockItemId: "item-a", quantity: 2 }],
      [0],
    );

    await releaseReservations(client, "order-1");

    expect(tx.stockItem.update).not.toHaveBeenCalled();
  });

  it("does nothing for an order without reservations", async () => {
    const { tx, client } = makeSettlementTransaction([]);

    await releaseReservations(client, "order-1");

    expect(tx.stockItem.update).not.toHaveBeenCalled();
  });
});
