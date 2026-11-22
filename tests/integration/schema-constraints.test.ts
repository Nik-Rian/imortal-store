import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  createDrop,
  createOrder,
  createProduct,
  createStockItem,
  disconnectTestPrisma,
  getTestPrisma,
  truncateAllTables,
} from "./helpers/db";

const prisma = getTestPrisma();

type DatabaseError = {
  message?: string;
  code?: string;
  meta?: unknown;
  cause?: unknown;
};

async function captureDatabaseError(
  operation: PromiseLike<unknown>,
): Promise<DatabaseError> {
  try {
    await operation;
  } catch (error) {
    return error as DatabaseError;
  }

  throw new Error(
    "Expected the database to reject the operation, but it succeeded.",
  );
}

// CHECK and RESTRICT violations are identified by constraint name, which PostgreSQL
// includes in its error message regardless of how the Prisma error is classified.
async function expectConstraintViolation(
  operation: PromiseLike<unknown>,
  constraintName: string,
): Promise<void> {
  const error = await captureDatabaseError(operation);
  const text = [
    error.message,
    JSON.stringify(error.meta ?? null),
    String(error.cause ?? ""),
  ].join("\n");

  expect(text).toContain(constraintName);
}

async function expectUniqueViolation(
  operation: PromiseLike<unknown>,
): Promise<void> {
  const error = await captureDatabaseError(operation);

  expect(error.code).toBe("P2002");
}

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("StockItem CHECK constraints", () => {
  test("accepts zero for onHand and reserved", async () => {
    const stockItem = await createStockItem({ onHand: 0, reserved: 0 });

    expect(stockItem.onHand).toBe(0);
    expect(stockItem.reserved).toBe(0);
  });

  test("rejects a negative onHand on insert and on update", async () => {
    await expectConstraintViolation(
      createStockItem({ onHand: -1 }),
      "StockItem_onHand_check",
    );

    const stockItem = await createStockItem({ onHand: 1 });

    await expectConstraintViolation(
      prisma.stockItem.update({
        where: { id: stockItem.id },
        data: { onHand: -1 },
      }),
      "StockItem_onHand_check",
    );

    const unchanged = await prisma.stockItem.findUniqueOrThrow({
      where: { id: stockItem.id },
    });
    expect(unchanged.onHand).toBe(1);
  });

  test("rejects a negative reserved on insert and on update", async () => {
    await expectConstraintViolation(
      createStockItem({ reserved: -1 }),
      "StockItem_reserved_check",
    );

    const stockItem = await createStockItem({ onHand: 1, reserved: 1 });

    await expectConstraintViolation(
      prisma.stockItem.update({
        where: { id: stockItem.id },
        data: { reserved: -1 },
      }),
      "StockItem_reserved_check",
    );

    const unchanged = await prisma.stockItem.findUniqueOrThrow({
      where: { id: stockItem.id },
    });
    expect(unchanged.reserved).toBe(1);
  });
});

describe("BundleComponent CHECK constraints", () => {
  test("rejects a quantity below 1", async () => {
    const bundle = await createProduct({ isBundle: true });
    const validComponent = await createProduct({ dropId: bundle.dropId });
    const invalidComponent = await createProduct({ dropId: bundle.dropId });

    const accepted = await prisma.bundleComponent.create({
      data: {
        bundleId: bundle.id,
        componentProductId: validComponent.id,
        quantity: 1,
      },
    });
    expect(accepted.quantity).toBe(1);

    await expectConstraintViolation(
      prisma.bundleComponent.create({
        data: {
          bundleId: bundle.id,
          componentProductId: invalidComponent.id,
          quantity: 0,
        },
      }),
      "BundleComponent_quantity_check",
    );

    await expectConstraintViolation(
      prisma.bundleComponent.create({
        data: {
          bundleId: bundle.id,
          componentProductId: invalidComponent.id,
          quantity: -1,
        },
      }),
      "BundleComponent_quantity_check",
    );
  });

  test("rejects a bundle that contains itself", async () => {
    const bundle = await createProduct({ isBundle: true });

    await expectConstraintViolation(
      prisma.bundleComponent.create({
        data: {
          bundleId: bundle.id,
          componentProductId: bundle.id,
          quantity: 1,
        },
      }),
      "BundleComponent_not_self_check",
    );
  });
});

describe("StockReservation constraints", () => {
  test("rejects a second reservation for the same order and stock item", async () => {
    const stockItem = await createStockItem({ onHand: 5 });
    const order = await createOrder();
    const otherOrder = await createOrder();

    await prisma.stockReservation.create({
      data: { orderId: order.id, stockItemId: stockItem.id, quantity: 1 },
    });

    // The same stock item reserved by a different order must remain allowed.
    await prisma.stockReservation.create({
      data: { orderId: otherOrder.id, stockItemId: stockItem.id, quantity: 1 },
    });

    await expectUniqueViolation(
      prisma.stockReservation.create({
        data: { orderId: order.id, stockItemId: stockItem.id, quantity: 1 },
      }),
    );

    expect(
      await prisma.stockReservation.count({ where: { orderId: order.id } }),
    ).toBe(1);
  });

  test("rejects deleting a stock item that has a reservation", async () => {
    const stockItem = await createStockItem({ onHand: 5 });
    const order = await createOrder();
    const reservation = await prisma.stockReservation.create({
      data: { orderId: order.id, stockItemId: stockItem.id, quantity: 1 },
    });

    await expectConstraintViolation(
      prisma.stockItem.delete({ where: { id: stockItem.id } }),
      "StockReservation_stockItemId_fkey",
    );

    expect(
      await prisma.stockItem.findUnique({ where: { id: stockItem.id } }),
    ).not.toBeNull();

    // Once the reservation is gone the same delete must succeed.
    await prisma.stockReservation.delete({ where: { id: reservation.id } });
    await prisma.stockItem.delete({ where: { id: stockItem.id } });
  });
});

describe("Order idempotencyKey", () => {
  test("rejects a duplicate key but allows several orders without a key", async () => {
    await createOrder();
    await createOrder();
    await createOrder({ idempotencyKey: "duplicate-key" });

    await expectUniqueViolation(
      createOrder({ idempotencyKey: "duplicate-key" }),
    );

    expect(await prisma.order.count()).toBe(3);
  });
});

describe("Drop single active status", () => {
  test("rejects a second active drop but allows any number of concluded drops", async () => {
    await createDrop({ status: "CONCLUDED" });
    await createDrop({ status: "CONCLUDED" });
    await createDrop({ status: "ACTIVE" });

    await expectUniqueViolation(createDrop({ status: "ACTIVE" }));

    expect(await prisma.drop.count({ where: { status: "ACTIVE" } })).toBe(1);
    expect(await prisma.drop.count({ where: { status: "CONCLUDED" } })).toBe(2);
  });

  test("lets only one of two concurrent active drops succeed", async () => {
    const results = await Promise.allSettled([
      createDrop({ status: "ACTIVE" }),
      createDrop({ status: "ACTIVE" }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await prisma.drop.count({ where: { status: "ACTIVE" } })).toBe(1);
  });
});
