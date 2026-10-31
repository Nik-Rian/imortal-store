import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getMercadoPagoOrder } from "@/services/mercadopago.service";
import { POST } from "./route";

// route.ts reads the secret at module load, so it must be set before ./route is imported.
const SECRET = vi.hoisted(() => {
  process.env.MERCADOPAGO_WEBHOOK_SECRET = "test-webhook-secret";
  return "test-webhook-secret";
});

vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findFirst: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@/services/mercadopago.service", () => ({
  getMercadoPagoOrder: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ORDER_ID = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
const REQUEST_ID = "req-123";
const TS = "1742505638683";

const sign = (dataId: string, secret = SECRET) =>
  crypto
    .createHmac("sha256", secret)
    .update(`id:${dataId.toLowerCase()};request-id:${REQUEST_ID};ts:${TS};`)
    .digest("hex");

const signatureHeader = (hash: string) => ({
  "x-signature": `ts=${TS},v1=${hash}`,
});

const webhookRequest = (
  headers: Record<string, string> = {},
  query = `data.id=${ORDER_ID}&type=order`,
) =>
  new Request(`http://localhost/api/webhooks/mercadopago?${query}`, {
    method: "POST",
    headers: { "x-request-id": REQUEST_ID, ...headers },
    body: JSON.stringify({
      action: "order.processed",
      type: "order",
      data: { id: ORDER_ID },
    }),
  });

const expectNoWork = () => {
  expect(getMercadoPagoOrder).not.toHaveBeenCalled();
  expect(prisma.order.findFirst).not.toHaveBeenCalled();
  expect(prisma.order.updateMany).not.toHaveBeenCalled();
};

describe("Mercado Pago webhook signature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getMercadoPagoOrder).mockResolvedValue({
      orderId: ORDER_ID,
      status: "processed",
      status_detail: "accredited",
      totalAmount: 50,
      totalPaidAmount: 50,
      externalReference: "order-1",
      payments: [
        { paymentId: "pay-1", status: "processed", statusDetail: "accredited" },
      ],
    } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: "order-1",
      accessToken: "tok",
      status: "PENDING",
      paymentStatus: "PENDING",
      totalPriceCents: 5000,
      paymentReviewReason: null,
    } as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("processes a validly signed order notification", async () => {
    const res = await POST(webhookRequest(signatureHeader(sign(ORDER_ID))));
    expect(res.status).toBe(200);
    // The provider fetch must keep the original-case id; only the manifest is lowercased.
    expect(getMercadoPagoOrder).toHaveBeenCalledWith(ORDER_ID);
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it("returns 401 and does no work when x-signature is missing", async () => {
    const res = await POST(webhookRequest());
    expect(res.status).toBe(401);
    expectNoWork();
  });

  it("returns 401 and does no work for a signature made with another secret", async () => {
    const res = await POST(
      webhookRequest(signatureHeader(sign(ORDER_ID, "wrong-secret"))),
    );
    expect(res.status).toBe(401);
    expectNoWork();
  });

  it("returns 401 when a valid signature for another notification is replayed", async () => {
    const res = await POST(
      webhookRequest(signatureHeader(sign("ORD01OTHERORDER"))),
    );
    expect(res.status).toBe(401);
    expectNoWork();
  });

  it.each(["order", "chargebacks", "payment"])(
    "returns 401 for an unsigned request with topic=%s",
    async (topic) => {
      const res = await POST(
        webhookRequest({}, `data.id=${ORDER_ID}&topic=${topic}`),
      );
      expect(res.status).toBe(401);
      expectNoWork();
    },
  );
});
