import { POST } from "@/app/api/webhooks/mercadopago/route";
import { prisma as applicationPrisma } from "@/lib/prisma";
import {
  getMercadoPagoOrder,
  type MercadoPagoOrderDetails,
} from "@/services/mercadopago.service";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createOrder,
  createStockItem,
  disconnectTestPrisma,
  getTestPrisma,
  truncateAllTables,
} from "./helpers/db";

// The route module builds its own Prisma client from DATABASE_URL when it is
// first imported, so the variable must point at the disposable test database
// before any import is evaluated.
vi.hoisted(() => {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not defined. Point it at a disposable database whose name contains "test".',
    );
  }
  process.env.DATABASE_URL = testDatabaseUrl;
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/mercadopago", () => ({
  verifyMercadoPagoSignature: vi.fn(() => true),
}));

vi.mock("@/services/mercadopago.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/mercadopago.service")>()),
  getMercadoPagoOrder: vi.fn(),
}));

const prisma = getTestPrisma();

const PROVIDER_ORDER_ID = "ORDTEST1";

const approved: Partial<MercadoPagoOrderDetails> = {};
const processing: Partial<MercadoPagoOrderDetails> = {
  status: "processing",
  status_detail: "in_process",
  totalPaidAmount: 0,
};
const pending: Partial<MercadoPagoOrderDetails> = {
  status: "pending",
  status_detail: undefined,
  totalPaidAmount: 0,
};
const failed: Partial<MercadoPagoOrderDetails> = {
  status: "failed",
  status_detail: "failed",
  totalPaidAmount: 0,
};
const expired: Partial<MercadoPagoOrderDetails> = {
  status: "expired",
  status_detail: undefined,
  totalPaidAmount: 0,
};
const refunded: Partial<MercadoPagoOrderDetails> = {
  status: "refunded",
  status_detail: undefined,
};
const partiallyRefunded: Partial<MercadoPagoOrderDetails> = {
  status: "processed",
  status_detail: "partially_refunded",
};
const chargeback: Partial<MercadoPagoOrderDetails> = {
  status: "charged_back",
  status_detail: "settled",
};

function providerOrder(
  orderId: string,
  overrides: Partial<MercadoPagoOrderDetails>,
): MercadoPagoOrderDetails {
  return {
    orderId: PROVIDER_ORDER_ID,
    status: "processed",
    status_detail: "accredited",
    totalAmount: 50,
    totalPaidAmount: 50,
    externalReference: orderId,
    payments: [{ paymentId: "payment-1", status: "processed" }],
    ...overrides,
  };
}

async function deliver(
  order: { id: string },
  overrides: Partial<MercadoPagoOrderDetails>,
) {
  vi.mocked(getMercadoPagoOrder).mockResolvedValue(
    providerOrder(order.id, overrides),
  );
  return POST(
    new Request(
      `http://localhost/api/webhooks/mercadopago?topic=order&data.id=${PROVIDER_ORDER_ID}`,
      { method: "POST", body: "{}" },
    ),
  );
}

// One order whose single reservation holds `quantity` units of one stock item.
async function seedReservedOrder({ onHand = 5, quantity = 2 } = {}) {
  const stockItem = await createStockItem({ onHand, reserved: quantity });
  const order = await createOrder({ totalPriceCents: 5000 });
  await prisma.stockReservation.create({
    data: {
      orderId: order.id,
      stockItemId: stockItem.id,
      quantity,
      status: "RESERVED",
    },
  });
  return { order, stockItem };
}

async function readState(orderId: string, stockItemId: string) {
  const [stock, reservation, order] = await Promise.all([
    prisma.stockItem.findUniqueOrThrow({ where: { id: stockItemId } }),
    prisma.stockReservation.findUniqueOrThrow({
      where: { orderId_stockItemId: { orderId, stockItemId } },
    }),
    prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
  ]);
  return {
    onHand: stock.onHand,
    reserved: stock.reserved,
    reservation: reservation.status,
    paymentStatus: order.paymentStatus,
    fulfillment: order.status,
    reviewReason: order.paymentReviewReason,
  };
}

beforeEach(async () => {
  await truncateAllTables();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.mocked(console.warn).mockRestore();
});

afterAll(async () => {
  await applicationPrisma.$disconnect();
  await disconnectTestPrisma();
});

describe("provider-confirmed outcomes settle stock reservations", () => {
  it("finalizes the reservation on approval", async () => {
    const { order, stockItem } = await seedReservedOrder();

    const res = await deliver(order, approved);

    expect(res.status).toBe(200);
    expect(await readState(order.id, stockItem.id)).toMatchObject({
      onHand: 3,
      reserved: 0,
      reservation: "FINALIZED",
      paymentStatus: "PAID",
    });
  });

  it("settles every reservation of a multi-line order", async () => {
    const first = await seedReservedOrder({ onHand: 4, quantity: 1 });
    const secondStock = await createStockItem({ onHand: 6, reserved: 3 });
    await prisma.stockReservation.create({
      data: {
        orderId: first.order.id,
        stockItemId: secondStock.id,
        quantity: 3,
        status: "RESERVED",
      },
    });

    await deliver(first.order, approved);

    expect(await readState(first.order.id, first.stockItem.id)).toMatchObject({
      onHand: 3,
      reserved: 0,
      reservation: "FINALIZED",
    });
    expect(await readState(first.order.id, secondStock.id)).toMatchObject({
      onHand: 3,
      reserved: 0,
      reservation: "FINALIZED",
    });
  });

  it.each([
    ["a confirmed failure", failed, "FAILED"],
    ["a confirmed expiry", expired, "EXPIRED"],
  ])("releases the reservation on %s", async (_label, outcome, expected) => {
    const { order, stockItem } = await seedReservedOrder();

    await deliver(order, outcome);

    expect(await readState(order.id, stockItem.id)).toMatchObject({
      onHand: 5,
      reserved: 0,
      reservation: "RELEASED",
      paymentStatus: expected,
      fulfillment: "CANCELED",
    });
  });

  it("keeps the reservation while the provider reports pending or in review", async () => {
    const { order, stockItem } = await seedReservedOrder();

    await deliver(order, pending);
    await deliver(order, processing);

    expect(await readState(order.id, stockItem.id)).toMatchObject({
      onHand: 5,
      reserved: 2,
      reservation: "RESERVED",
      paymentStatus: "IN_REVIEW",
    });
  });

  it("changes nothing for an order that has no reservations", async () => {
    const unrelated = await createStockItem({ onHand: 5, reserved: 0 });
    const order = await createOrder({ totalPriceCents: 5000 });

    const res = await deliver(order, approved);

    expect(res.status).toBe(200);
    const stock = await prisma.stockItem.findUniqueOrThrow({
      where: { id: unrelated.id },
    });
    expect(stock).toMatchObject({ onHand: 5, reserved: 0 });
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .paymentStatus,
    ).toBe("PAID");
  });
});

describe("repeated and out-of-order notifications", () => {
  it("changes stock once when the same approval is delivered several times in sequence", async () => {
    const { order, stockItem } = await seedReservedOrder();

    for (let delivery = 0; delivery < 3; delivery++) {
      expect((await deliver(order, approved)).status).toBe(200);
    }

    expect(await readState(order.id, stockItem.id)).toMatchObject({
      onHand: 3,
      reserved: 0,
      reservation: "FINALIZED",
    });
  });

  it("changes stock once when the same approval is delivered concurrently", async () => {
    const { order, stockItem } = await seedReservedOrder();

    const responses = await Promise.all([
      deliver(order, approved),
      deliver(order, approved),
      deliver(order, approved),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200,
    ]);
    expect(await readState(order.id, stockItem.id)).toMatchObject({
      onHand: 3,
      reserved: 0,
      reservation: "FINALIZED",
    });
  });

  it("changes stock once when the same expiry is delivered several times", async () => {
    const { order, stockItem } = await seedReservedOrder();

    await deliver(order, expired);
    await deliver(order, expired);

    expect(await readState(order.id, stockItem.id)).toMatchObject({
      onHand: 5,
      reserved: 0,
      reservation: "RELEASED",
    });
  });

  it.each([
    ["review then approval", [processing, approved]],
    ["approval then a stale review notice", [approved, processing]],
  ])("converges to one finalization for %s", async (_label, sequence) => {
    const { order, stockItem } = await seedReservedOrder();

    for (const outcome of sequence) {
      await deliver(order, outcome);
    }

    expect(await readState(order.id, stockItem.id)).toMatchObject({
      onHand: 3,
      reserved: 0,
      reservation: "FINALIZED",
      paymentStatus: "PAID",
    });
  });

  it("ignores a stale failure notice after approval", async () => {
    const { order, stockItem } = await seedReservedOrder();

    await deliver(order, approved);
    await deliver(order, failed);

    expect(await readState(order.id, stockItem.id)).toMatchObject({
      onHand: 3,
      reserved: 0,
      reservation: "FINALIZED",
      paymentStatus: "PAID",
    });
  });
});

describe("refunds and chargebacks never alter inventory", () => {
  it.each([
    ["a full refund", refunded, "REFUNDED"],
    ["a partial refund", partiallyRefunded, "PARTIALLY_REFUNDED"],
    ["a lost chargeback", chargeback, "CHARGEBACK_LOST"],
  ])(
    "leaves stock and fulfilment untouched after %s of a ready order",
    async (_label, outcome, expected) => {
      const { order, stockItem } = await seedReservedOrder();
      await deliver(order, approved);
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "READY_FOR_PICKUP" },
      });

      await deliver(order, outcome);

      expect(await readState(order.id, stockItem.id)).toMatchObject({
        onHand: 3,
        reserved: 0,
        reservation: "FINALIZED",
        paymentStatus: expected,
        fulfillment: "READY_FOR_PICKUP",
      });
    },
  );
});

describe("late approvals", () => {
  it("flags an approval that arrives after the reservation was released and changes no stock", async () => {
    const { order, stockItem } = await seedReservedOrder();
    await deliver(order, failed);

    const res = await deliver(order, approved);

    expect(res.status).toBe(200);
    expect(await readState(order.id, stockItem.id)).toMatchObject({
      onHand: 5,
      reserved: 0,
      reservation: "RELEASED",
      fulfillment: "CANCELED",
      reviewReason: "LATE_PAYMENT",
    });
  });

  it("does not finalize a reservation of an order that was already canceled", async () => {
    const { order, stockItem } = await seedReservedOrder();
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELED" },
    });

    await deliver(order, approved);

    expect(await readState(order.id, stockItem.id)).toMatchObject({
      onHand: 5,
      reserved: 2,
      reservation: "RESERVED",
      fulfillment: "CANCELED",
      reviewReason: "LATE_PAYMENT",
    });
  });
});
