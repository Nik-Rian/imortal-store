import { PaymentStatus } from "@/generated/prisma/client";
import { mapPaymentStatus } from "@/lib/payment-status";
import { prisma } from "@/lib/prisma";
import {
  getMercadoPagoOrder,
  MercadoPagoTimeoutError,
} from "@/services/mercadopago.service";
import {
  finalizeReservations,
  releaseReservations,
} from "@/services/stock.service";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findFirst: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/services/mercadopago.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/mercadopago.service")>()),
  getMercadoPagoOrder: vi.fn(),
}));

vi.mock("@/services/stock.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/stock.service")>()),
  finalizeReservations: vi.fn(),
  releaseReservations: vi.fn(),
}));

vi.mock("@/lib/mercadopago", () => ({
  verifyMercadoPagoSignature: vi.fn(() => true),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("Webhook Status Transitions", () => {
  test.each([
    // [Provider Status, Provider Detail, Expected PaymentStatus, Description]

    // Normal progression
    ["pending", undefined, PaymentStatus.PENDING, "pending -> PENDING"],
    ["processed", undefined, PaymentStatus.PAID, "processed -> PAID"],
    ["expired", undefined, PaymentStatus.EXPIRED, "expired -> EXPIRED"],
    [
      "processing",
      undefined,
      PaymentStatus.IN_REVIEW,
      "processing -> IN_REVIEW",
    ],
    [
      "processed",
      "partially_refunded",
      PaymentStatus.PARTIALLY_REFUNDED,
      "processed (partially_refunded) -> PARTIALLY_REFUNDED",
    ],
    [
      "charged_back",
      "settled",
      PaymentStatus.CHARGEBACK_LOST,
      "charged_back (settled) -> CHARGEBACK_LOST",
    ],
    ["canceled", undefined, PaymentStatus.CANCELED, "canceled -> CANCELED"],
    ["failed", undefined, PaymentStatus.FAILED, "failed -> FAILED"],

    // Refunds and chargebacks
    ["refunded", undefined, PaymentStatus.REFUNDED, "refunded -> REFUNDED"],
    [
      "partially_refunded",
      undefined,
      PaymentStatus.PARTIALLY_REFUNDED,
      "partially_refunded -> PARTIALLY_REFUNDED",
    ],
    [
      "charged_back",
      "in_process",
      PaymentStatus.CHARGEBACK_IN_REVIEW,
      "charged_back (in_process) -> CHARGEBACK_IN_REVIEW",
    ],
    [
      "charged_back",
      "reimbursed",
      PaymentStatus.CHARGEBACK_WON,
      "charged_back (reimbursed) -> CHARGEBACK_WON",
    ],
    [
      "charged_back",
      "anything_else",
      PaymentStatus.CHARGEBACK_LOST,
      "charged_back (default) -> CHARGEBACK_LOST",
    ],
  ])(
    "given provider %s (detail: %s), returns %s (%s)",
    (mpStatus, mpStatusDetail, expectedStatus, _description) => {
      void _description; // Clears the unused variable warning

      const result = mapPaymentStatus(mpStatus, mpStatusDetail);

      expect(result).toBe(expectedStatus);
    },
  );
});

describe("Webhook resource id handling", () => {
  const request = (query: string) =>
    new Request(`http://localhost/api/webhooks/mercadopago?${query}`, {
      method: "POST",
      body: "{}",
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each(["chargebacks", "order", "order.charged_back"])(
    "acknowledges topic %s with a non-order id without calling the provider",
    async (topic) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const res = await POST(request(`topic=${topic}&data.id=123456789`));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, ignored: true });
      expect(getMercadoPagoOrder).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.any(String), {
        topic,
        resourceId: "123456789",
      });
    },
  );

  test.each([
    [
      "a provider error",
      () => new Error("Failed to fetch order ORD1ABC from Mercado Pago."),
    ],
    ["a provider timeout", () => new MercadoPagoTimeoutError()],
  ])(
    "answers 500 so the provider retries after %s for a valid order id",
    async (_label, makeError) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(getMercadoPagoOrder).mockRejectedValueOnce(makeError());

      const res = await POST(request("topic=order&data.id=ORD1ABC"));

      expect(res.status).toBe(500);
      expect(getMercadoPagoOrder).toHaveBeenCalledWith("ORD1ABC");
      expect(error).toHaveBeenCalled();
    },
  );
});

describe("Webhook stock effects per payment status", () => {
  const providerOrder = (overrides: Record<string, unknown> = {}) => ({
    orderId: "ORD123",
    status: "processed",
    status_detail: "accredited",
    totalAmount: 50,
    totalPaidAmount: 50,
    externalReference: "order-1",
    payments: [{ paymentId: "pay-1", status: "processed" }],
    ...overrides,
  });

  const localOrder = (overrides: Record<string, unknown> = {}) => ({
    id: "order-1",
    accessToken: "tok",
    status: "PENDING",
    paymentStatus: "PENDING",
    totalPriceCents: 5000,
    paymentReviewReason: null,
    ...overrides,
  });

  const request = () =>
    new Request(
      "http://localhost/api/webhooks/mercadopago?topic=order&data.id=ORD123",
      { method: "POST", body: "{}" },
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.$transaction).mockImplementation(((
      callback: (tx: unknown) => unknown,
    ) => callback(prisma)) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  type Effect = "finalize" | "release" | "none";

  // paymentStatus null: the notification changes nothing and no transaction runs.
  const cases: {
    name: string;
    provider: Record<string, unknown>;
    local: Record<string, unknown>;
    effect: Effect;
    paymentStatus: string | null;
    fulfillment?: string;
  }[] = [
    {
      name: "approval finalizes the reservations",
      provider: {},
      local: {},
      effect: "finalize",
      paymentStatus: "PAID",
      fulfillment: "PENDING",
    },
    {
      name: "approval after review finalizes the reservations",
      provider: {},
      local: { paymentStatus: "IN_REVIEW" },
      effect: "finalize",
      paymentStatus: "PAID",
      fulfillment: "PENDING",
    },
    {
      name: "failure releases the reservations",
      provider: {
        status: "failed",
        status_detail: "failed",
        totalPaidAmount: 0,
      },
      local: {},
      effect: "release",
      paymentStatus: "FAILED",
      fulfillment: "CANCELED",
    },
    {
      name: "expiry releases the reservations",
      provider: {
        status: "expired",
        status_detail: undefined,
        totalPaidAmount: 0,
      },
      local: {},
      effect: "release",
      paymentStatus: "EXPIRED",
      fulfillment: "CANCELED",
    },
    {
      name: "provider cancellation releases the reservations",
      provider: {
        status: "canceled",
        status_detail: undefined,
        totalPaidAmount: 0,
      },
      local: {},
      effect: "release",
      paymentStatus: "CANCELED",
      fulfillment: "CANCELED",
    },
    {
      name: "pending keeps the reservations",
      provider: {
        status: "pending",
        status_detail: undefined,
        totalPaidAmount: 0,
      },
      local: {},
      effect: "none",
      paymentStatus: null,
    },
    {
      name: "processing keeps the reservations",
      provider: {
        status: "processing",
        status_detail: "in_process",
        totalPaidAmount: 0,
      },
      local: {},
      effect: "none",
      paymentStatus: "IN_REVIEW",
      fulfillment: "PENDING",
    },
    {
      name: "amount mismatch keeps the reservations",
      provider: { totalAmount: 40, totalPaidAmount: 40 },
      local: {},
      effect: "none",
      paymentStatus: "IN_REVIEW",
      fulfillment: "PENDING",
    },
    {
      name: "full refund of a ready order changes no stock or fulfilment",
      provider: { status: "refunded", status_detail: undefined },
      local: { paymentStatus: "PAID", status: "READY_FOR_PICKUP" },
      effect: "none",
      paymentStatus: "REFUNDED",
      fulfillment: "READY_FOR_PICKUP",
    },
    {
      name: "partial refund of a completed order changes no stock or fulfilment",
      provider: { status: "processed", status_detail: "partially_refunded" },
      local: { paymentStatus: "PAID", status: "COMPLETED" },
      effect: "none",
      paymentStatus: "PARTIALLY_REFUNDED",
      fulfillment: "COMPLETED",
    },
    {
      name: "chargeback in review changes no stock or fulfilment",
      provider: { status: "charged_back", status_detail: "in_process" },
      local: { paymentStatus: "PAID", status: "READY_FOR_PICKUP" },
      effect: "none",
      paymentStatus: "CHARGEBACK_IN_REVIEW",
      fulfillment: "READY_FOR_PICKUP",
    },
    {
      name: "lost chargeback changes no stock or fulfilment",
      provider: { status: "charged_back", status_detail: "settled" },
      local: { paymentStatus: "PAID", status: "COMPLETED" },
      effect: "none",
      paymentStatus: "CHARGEBACK_LOST",
      fulfillment: "COMPLETED",
    },
    {
      name: "won chargeback changes no stock or fulfilment",
      provider: { status: "charged_back", status_detail: "reimbursed" },
      local: { paymentStatus: "PAID", status: "READY_FOR_PICKUP" },
      effect: "none",
      paymentStatus: "CHARGEBACK_WON",
      fulfillment: "READY_FOR_PICKUP",
    },
    {
      name: "a repeated approval has no effect",
      provider: {},
      local: { paymentStatus: "PAID" },
      effect: "none",
      paymentStatus: null,
    },
  ];

  test.each(cases)(
    "$name",
    async ({ provider, local, effect, paymentStatus, fulfillment }) => {
      vi.mocked(getMercadoPagoOrder).mockResolvedValue(
        providerOrder(provider) as never,
      );
      vi.mocked(prisma.order.findFirst).mockResolvedValue(
        localOrder(local) as never,
      );

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(finalizeReservations).toHaveBeenCalledTimes(
        effect === "finalize" ? 1 : 0,
      );
      expect(releaseReservations).toHaveBeenCalledTimes(
        effect === "release" ? 1 : 0,
      );
      if (paymentStatus === null) {
        expect(prisma.$transaction).not.toHaveBeenCalled();
        return;
      }
      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentStatus,
            status: fulfillment,
          }),
        }),
      );
    },
  );

  test("a payment confirmed after the order was canceled stays flagged and finalizes nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getMercadoPagoOrder).mockResolvedValue(providerOrder() as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      localOrder({ paymentStatus: "EXPIRED", status: "CANCELED" }) as never,
    );

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: "PAID",
          status: "CANCELED",
          paymentReviewReason: "LATE_PAYMENT",
        }),
      }),
    );
    expect(finalizeReservations).not.toHaveBeenCalled();
    expect(releaseReservations).not.toHaveBeenCalled();
  });

  test("applies no stock effect when the compare-and-set loses", async () => {
    vi.mocked(getMercadoPagoOrder).mockResolvedValue(providerOrder() as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(localOrder() as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });

    const res = await POST(request());

    expect(res.status).toBe(409);
    expect(finalizeReservations).not.toHaveBeenCalled();
    expect(releaseReservations).not.toHaveBeenCalled();
  });
});
