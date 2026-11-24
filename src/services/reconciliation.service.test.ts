import { prisma } from "@/lib/prisma";
import {
  getMercadoPagoOrder,
  searchMercadoPagoOrdersByExternalReference,
} from "@/services/mercadopago.service";
import {
  abandonUnpaidOrder,
  syncOrderPayment,
} from "@/services/payment-sync.service";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  reconcileStalePayments,
  RECONCILIATION_BATCH_SIZE,
} from "./reconciliation.service";

vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findMany: vi.fn(), updateMany: vi.fn() } },
}));

vi.mock("@/services/mercadopago.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/mercadopago.service")>()),
  getMercadoPagoOrder: vi.fn(),
  searchMercadoPagoOrdersByExternalReference: vi.fn(),
}));

vi.mock("@/services/payment-sync.service", () => ({
  syncOrderPayment: vi.fn(),
  abandonUnpaidOrder: vi.fn(),
}));

const NOW = new Date("2026-11-24T12:00:00.000Z");
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);

type Row = {
  id: string;
  accessToken: string;
  mpOrderId: string | null;
  paymentMethod: "PIX" | "CARD";
  paymentStatus: string;
  status: string;
  createdAt: Date;
};

const row = (overrides: Partial<Row> = {}): Row => ({
  id: "order-1",
  accessToken: "tok",
  mpOrderId: null,
  paymentMethod: "PIX",
  paymentStatus: "PENDING",
  status: "PENDING",
  createdAt: minutesAgo(90),
  ...overrides,
});

const providerOrder = (overrides: Record<string, unknown> = {}) => ({
  orderId: "ORD1",
  status: "processed",
  totalAmount: 50,
  totalPaidAmount: 50,
  externalReference: "order-1",
  payments: [{ paymentId: "pay-1", status: "processed" }],
  ...overrides,
});

type FindManyArgs = {
  where: { paymentStatus: { in: string[] }; createdAt: { lt: Date } };
};

function seed(rows: Row[]) {
  vi.mocked(prisma.order.findMany).mockImplementation((async (
    args: FindManyArgs,
  ) =>
    rows.filter(
      (r) =>
        args.where.paymentStatus.in.includes(r.paymentStatus) &&
        r.createdAt < args.where.createdAt.lt,
    )) as never);
}

const linkCalls = () =>
  vi
    .mocked(prisma.order.updateMany)
    .mock.calls.filter(([args]) => args.where?.mpOrderId === null);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(syncOrderPayment).mockResolvedValue("updated");
  vi.mocked(abandonUnpaidOrder).mockResolvedValue("abandoned");
});

describe("selection", () => {
  test("selects only stale orders whose payment is pending or in review, in a bounded batch", async () => {
    seed([]);

    await reconcileStalePayments(NOW);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          paymentStatus: { in: ["PENDING", "IN_REVIEW"] },
          createdAt: { lt: minutesAgo(45) },
        },
        take: RECONCILIATION_BATCH_SIZE,
      }),
    );
  });

  test("never selects or changes paid orders that are ready or completed", async () => {
    seed([
      row({ id: "ready", paymentStatus: "PAID", status: "READY_FOR_PICKUP" }),
      row({ id: "done", paymentStatus: "PAID", status: "COMPLETED" }),
      row({ id: "young", createdAt: minutesAgo(10) }),
    ]);

    const summary = await reconcileStalePayments(NOW);

    expect(summary.examined).toBe(0);
    expect(getMercadoPagoOrder).not.toHaveBeenCalled();
    expect(searchMercadoPagoOrdersByExternalReference).not.toHaveBeenCalled();
    expect(syncOrderPayment).not.toHaveBeenCalled();
    expect(abandonUnpaidOrder).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});

describe("orders with a provider id", () => {
  test("applies the provider state through the shared sync", async () => {
    seed([row({ mpOrderId: "ORD1" })]);
    vi.mocked(getMercadoPagoOrder).mockResolvedValue(providerOrder() as never);

    const summary = await reconcileStalePayments(NOW);

    expect(getMercadoPagoOrder).toHaveBeenCalledWith("ORD1");
    expect(syncOrderPayment).toHaveBeenCalledWith(providerOrder());
    expect(summary.outcomes.synced).toBe(1);
  });

  test("a card payment still pending at the provider stays reserved and is listed as stale", async () => {
    seed([row({ mpOrderId: "ORD1", paymentMethod: "CARD" })]);
    vi.mocked(getMercadoPagoOrder).mockResolvedValue(
      providerOrder({ status: "pending" }) as never,
    );
    vi.mocked(syncOrderPayment).mockResolvedValue("unchanged");

    const summary = await reconcileStalePayments(NOW);

    expect(summary.outcomes.still_pending).toBe(1);
    expect(summary.stalePending).toEqual([
      { orderId: "order-1", paymentMethod: "CARD" },
    ]);
    expect(abandonUnpaidOrder).not.toHaveBeenCalled();
  });

  test("a provider order that does not exist changes nothing", async () => {
    seed([row({ mpOrderId: "ORD1" })]);
    vi.mocked(getMercadoPagoOrder).mockResolvedValue(null);

    const summary = await reconcileStalePayments(NOW);

    expect(summary.outcomes.provider_order_missing).toBe(1);
    expect(syncOrderPayment).not.toHaveBeenCalled();
    expect(abandonUnpaidOrder).not.toHaveBeenCalled();
  });
});

describe("orders without a provider id", () => {
  test("links a found provider order and syncs it", async () => {
    seed([row()]);
    vi.mocked(searchMercadoPagoOrdersByExternalReference).mockResolvedValue([
      providerOrder(),
    ] as never);

    const summary = await reconcileStalePayments(NOW);

    expect(linkCalls()).toHaveLength(1);
    expect(linkCalls()[0][0]).toEqual({
      where: { id: "order-1", mpOrderId: null },
      data: { mpOrderId: "ORD1", mpPaymentId: "pay-1" },
    });
    expect(syncOrderPayment).toHaveBeenCalledWith(providerOrder());
    expect(summary.outcomes.synced).toBe(1);
    expect(abandonUnpaidOrder).not.toHaveBeenCalled();
  });

  test("searches inside a window of at most 30 days that starts at the order creation", async () => {
    seed([row()]);
    vi.mocked(searchMercadoPagoOrdersByExternalReference).mockResolvedValue([]);

    await reconcileStalePayments(NOW);

    const [reference, searchWindow] = vi.mocked(
      searchMercadoPagoOrdersByExternalReference,
    ).mock.calls[0];
    expect(reference).toBe("order-1");
    expect(searchWindow.to).toEqual(NOW);
    expect(searchWindow.from.getTime()).toBeLessThan(minutesAgo(90).getTime());
    expect(
      searchWindow.to.getTime() - searchWindow.from.getTime(),
    ).toBeLessThan(30 * 24 * 60 * 60 * 1000);
  });

  test("abandons an order after an empty search once the abandonment age is reached", async () => {
    seed([row({ createdAt: minutesAgo(61) })]);
    vi.mocked(searchMercadoPagoOrdersByExternalReference).mockResolvedValue([]);

    const summary = await reconcileStalePayments(NOW);

    expect(abandonUnpaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: "order-1", accessToken: "tok" }),
    );
    expect(summary.outcomes.abandoned).toBe(1);
  });

  test("does not abandon an order younger than the abandonment age", async () => {
    seed([row({ createdAt: minutesAgo(50) })]);
    vi.mocked(searchMercadoPagoOrdersByExternalReference).mockResolvedValue([]);

    const summary = await reconcileStalePayments(NOW);

    expect(abandonUnpaidOrder).not.toHaveBeenCalled();
    expect(summary.outcomes.awaiting_abandonment).toBe(1);
  });

  test("a failed search changes nothing and is reported", async () => {
    seed([row({ createdAt: minutesAgo(120) })]);
    vi.mocked(searchMercadoPagoOrdersByExternalReference).mockRejectedValue(
      new Error("Failed to search orders in Mercado Pago (status 500)."),
    );

    const summary = await reconcileStalePayments(NOW);

    expect(summary.outcomes.failed).toBe(1);
    expect(summary.failures).toEqual([
      {
        orderId: "order-1",
        reason: "Failed to search orders in Mercado Pago (status 500).",
      },
    ]);
    expect(abandonUnpaidOrder).not.toHaveBeenCalled();
    expect(syncOrderPayment).not.toHaveBeenCalled();
    expect(linkCalls()).toHaveLength(0);
  });

  test("more than one provider order for a reference changes nothing", async () => {
    seed([row({ createdAt: minutesAgo(120) })]);
    vi.mocked(searchMercadoPagoOrdersByExternalReference).mockResolvedValue([
      providerOrder(),
      providerOrder({ orderId: "ORD2" }),
    ] as never);

    const summary = await reconcileStalePayments(NOW);

    expect(summary.outcomes.failed).toBe(1);
    expect(syncOrderPayment).not.toHaveBeenCalled();
    expect(abandonUnpaidOrder).not.toHaveBeenCalled();
  });

  test("an order older than the search window is never abandoned", async () => {
    seed([
      row({ createdAt: new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000) }),
    ]);

    const summary = await reconcileStalePayments(NOW);

    expect(summary.outcomes.search_window_exceeded).toBe(1);
    expect(searchMercadoPagoOrdersByExternalReference).not.toHaveBeenCalled();
    expect(abandonUnpaidOrder).not.toHaveBeenCalled();
  });

  test("a lost abandonment compare-and-set is reported as a conflict", async () => {
    seed([row({ createdAt: minutesAgo(120) })]);
    vi.mocked(searchMercadoPagoOrdersByExternalReference).mockResolvedValue([]);
    vi.mocked(abandonUnpaidOrder).mockResolvedValue("conflict");

    const summary = await reconcileStalePayments(NOW);

    expect(summary.outcomes.conflict).toBe(1);
    expect(summary.outcomes.abandoned).toBe(0);
  });
});

describe("batch behavior", () => {
  test("a failing order does not stop the remaining orders", async () => {
    seed([
      row({ id: "order-1", mpOrderId: "ORD1" }),
      row({ id: "order-2", mpOrderId: "ORD2" }),
    ]);
    vi.mocked(getMercadoPagoOrder)
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(
        providerOrder({
          orderId: "ORD2",
          externalReference: "order-2",
        }) as never,
      );

    const summary = await reconcileStalePayments(NOW);

    expect(summary.examined).toBe(2);
    expect(summary.outcomes.failed).toBe(1);
    expect(summary.outcomes.synced).toBe(1);
  });

  test("stamps every attempted order that is still unresolved", async () => {
    seed([row({ mpOrderId: "ORD1" })]);
    vi.mocked(getMercadoPagoOrder).mockResolvedValue(providerOrder() as never);

    await reconcileStalePayments(NOW);

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        paymentStatus: { in: ["PENDING", "IN_REVIEW"] },
      },
      data: { lastPaymentSync: NOW },
    });
  });
});
