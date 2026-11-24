import { prisma } from "@/lib/prisma";
import {
  finalizeReservations,
  releaseReservations,
} from "@/services/stock.service";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { abandonUnpaidOrder, syncOrderPayment } from "./payment-sync.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findFirst: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/services/stock.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/stock.service")>()),
  finalizeReservations: vi.fn(),
  releaseReservations: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.$transaction).mockImplementation(((
    callback: (tx: unknown) => unknown,
  ) => callback(prisma)) as never);
});

describe("syncOrderPayment", () => {
  test("approval marks the order paid, finalizes reservations and revalidates", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(localOrder() as never);

    const outcome = await syncOrderPayment(providerOrder() as never);

    expect(outcome).toBe("updated");
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mpOrderId: "ORD123",
          paymentStatus: "PAID",
          status: "PENDING",
        }),
      }),
    );
    expect(finalizeReservations).toHaveBeenCalledTimes(1);
    expect(releaseReservations).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/pedidos/tok");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/pedidos");
  });

  test("failure cancels the order and releases reservations", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(localOrder() as never);

    const outcome = await syncOrderPayment(
      providerOrder({
        status: "failed",
        status_detail: "failed",
        totalPaidAmount: 0,
      }) as never,
    );

    expect(outcome).toBe("updated");
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: "FAILED",
          status: "CANCELED",
        }),
      }),
    );
    expect(releaseReservations).toHaveBeenCalledTimes(1);
    expect(finalizeReservations).not.toHaveBeenCalled();
  });

  test("a provider state that changes nothing writes nothing", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(localOrder() as never);

    const outcome = await syncOrderPayment(
      providerOrder({
        status: "pending",
        status_detail: undefined,
        totalPaidAmount: 0,
      }) as never,
    );

    expect(outcome).toBe("unchanged");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("reports not_found when no local order matches", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

    expect(await syncOrderPayment(providerOrder() as never)).toBe("not_found");
  });

  test("a payment confirmed after cancellation stays flagged and finalizes nothing", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      localOrder({ paymentStatus: "EXPIRED", status: "CANCELED" }) as never,
    );

    await syncOrderPayment(providerOrder() as never);

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

  test("reports a conflict after repeated lost compare-and-set attempts", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(localOrder() as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });

    const outcome = await syncOrderPayment(providerOrder() as never);

    expect(outcome).toBe("conflict");
    expect(prisma.order.findFirst).toHaveBeenCalledTimes(3);
    expect(finalizeReservations).not.toHaveBeenCalled();
  });
});

describe("abandonUnpaidOrder", () => {
  const order = { id: "order-1", accessToken: "tok" };

  test("fails and cancels an untouched order and releases its reservations", async () => {
    const outcome = await abandonUnpaidOrder(order);

    expect(outcome).toBe("abandoned");
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        paymentStatus: "PENDING",
        status: "PENDING",
        mpOrderId: null,
      },
      data: expect.objectContaining({
        paymentStatus: "FAILED",
        status: "CANCELED",
      }),
    });
    expect(releaseReservations).toHaveBeenCalledWith(prisma, "order-1");
    expect(revalidatePath).toHaveBeenCalledWith("/pedidos/tok");
  });

  test("changes nothing when the compare-and-set loses", async () => {
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });

    const outcome = await abandonUnpaidOrder(order);

    expect(outcome).toBe("conflict");
    expect(releaseReservations).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("the compare-and-set only matches orders whose fulfilment is still PENDING", async () => {
    await abandonUnpaidOrder(order);

    // A prepared or ready order does not match, so it is never canceled.
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
      }),
    );
  });
});
