import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getMercadoPagoOrder } from "@/services/mercadopago.service";
import { POST } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findFirst: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@/services/mercadopago.service", () => ({
  getMercadoPagoOrder: vi.fn(),
}));
vi.mock("@/lib/mercadopago", () => ({
  verifyMercadoPagoSignature: vi.fn(() => true),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mpOrder = (overrides: Record<string, unknown> = {}) => ({
  orderId: "ORD123",
  status: "processed",
  status_detail: "accredited",
  totalAmount: 50,
  totalPaidAmount: 50,
  externalReference: "order-1",
  payments: [
    { paymentId: "pay-1", status: "processed", statusDetail: "accredited" },
  ],
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

const webhookRequest = () =>
  new Request(
    "http://localhost/api/webhooks/mercadopago?topic=order&data.id=ORD123",
    { method: "POST", body: "{}" },
  );

describe("Mercado Pago webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMercadoPagoOrder).mockResolvedValue(mpOrder() as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(localOrder() as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
  });

  it("applies the first processed notice once and ignores the replay", async () => {
    vi.mocked(prisma.order.findFirst)
      .mockResolvedValueOnce(localOrder() as never)
      .mockResolvedValueOnce(localOrder({ paymentStatus: "PAID" }) as never);

    const first = await POST(webhookRequest());
    const second = await POST(webhookRequest());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1", paymentStatus: "PENDING", status: "PENDING" },
        data: expect.objectContaining({
          paymentStatus: "PAID",
          paidAmount: 5000,
        }),
      }),
    );
  });

  it("leaves a READY_FOR_PICKUP order untouched on a duplicate processed notice", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      localOrder({
        paymentStatus: "PAID",
        status: "READY_FOR_PICKUP",
      }) as never,
    );
    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("cancels the order when the provider reports expired", async () => {
    vi.mocked(getMercadoPagoOrder).mockResolvedValue(
      mpOrder({
        status: "expired",
        status_detail: undefined,
        totalPaidAmount: 0,
      }) as never,
    );
    await POST(webhookRequest());
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: "EXPIRED",
          status: "CANCELED",
        }),
      }),
    );
  });

  it("does not mark PAID on an amount mismatch and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getMercadoPagoOrder).mockResolvedValue(
      mpOrder({ totalAmount: 40, totalPaidAmount: 40 }) as never,
    );
    await POST(webhookRequest());
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: "IN_REVIEW",
          paymentReviewReason: "AMOUNT_MISMATCH",
        }),
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("flagged"),
      expect.objectContaining({ reason: "AMOUNT_MISMATCH" }),
    );
    warn.mockRestore();
  });

  it("answers 409 so the provider retries when compare-and-set keeps losing", async () => {
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });
    const res = await POST(webhookRequest());
    expect(res.status).toBe(409);
    expect(prisma.order.findFirst).toHaveBeenCalledTimes(3);
  });
});
