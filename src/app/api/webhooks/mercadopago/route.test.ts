import { PaymentStatus } from "@/generated/prisma/client";
import { mapPaymentStatus } from "@/lib/payment-status";
import {
  getMercadoPagoOrder,
  MercadoPagoTimeoutError,
} from "@/services/mercadopago.service";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/services/mercadopago.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/mercadopago.service")>()),
  getMercadoPagoOrder: vi.fn(),
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
