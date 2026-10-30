import { describe, expect, it } from "vitest";
import type {
  OrderStatus,
  PaymentReviewReason,
  PaymentStatus,
} from "@/generated/prisma/client";
import { resolveFulfillmentStatus, resolvePaymentSync } from "./payment-status";

describe("resolveFulfillmentStatus", () => {
  it.each([
    "PARTIALLY_REFUNDED",
    "REFUNDED",
    "CHARGEBACK_IN_REVIEW",
    "CHARGEBACK_LOST",
  ] as const)(
    "keeps READY_FOR_PICKUP unchanged when payment becomes %s",
    (payment) => {
      expect(resolveFulfillmentStatus("READY_FOR_PICKUP", payment)).toBe(
        "READY_FOR_PICKUP",
      );
    },
  );

  it("keeps COMPLETED unchanged after a lost chargeback", () => {
    expect(resolveFulfillmentStatus("COMPLETED", "CHARGEBACK_LOST")).toBe(
      "COMPLETED",
    );
  });

  it.each([
    "FAILED",
    "CANCELED",
    "EXPIRED",
    "REFUNDED",
    "CHARGEBACK_LOST",
  ] as const)("cancels a PENDING order when payment becomes %s", (payment) => {
    expect(resolveFulfillmentStatus("PENDING", payment)).toBe("CANCELED");
  });

  it.each(["PENDING", "IN_REVIEW", "PAID", "PARTIALLY_REFUNDED"] as const)(
    "keeps PENDING when payment becomes %s",
    (payment) => {
      expect(resolveFulfillmentStatus("PENDING", payment)).toBe("PENDING");
    },
  );
});

function sync(
  local: { paymentStatus: PaymentStatus; status: OrderStatus },
  provider: { status: string; detail?: string; total?: number; paid?: number },
  reviewReason: PaymentReviewReason | null = null,
) {
  return resolvePaymentSync({
    order: {
      ...local,
      totalPriceCents: 5000,
      paymentReviewReason: reviewReason,
    },
    providerStatus: provider.status,
    providerStatusDetail: provider.detail,
    providerTotalCents: provider.total ?? 5000,
    providerPaidCents: provider.paid ?? 5000,
  });
}

describe("resolvePaymentSync (local status x provider status)", () => {
  it.each<
    [
      string,
      PaymentStatus,
      OrderStatus,
      string,
      string | undefined,
      PaymentStatus,
      OrderStatus,
      boolean,
    ]
  >([
    [
      "first payment",
      "PENDING",
      "PENDING",
      "processed",
      "accredited",
      "PAID",
      "PENDING",
      true,
    ],
    [
      "duplicate processed, READY",
      "PAID",
      "READY_FOR_PICKUP",
      "processed",
      "accredited",
      "PAID",
      "READY_FOR_PICKUP",
      false,
    ],
    [
      "duplicate processed, COMPLETED",
      "PAID",
      "COMPLETED",
      "processed",
      "accredited",
      "PAID",
      "COMPLETED",
      false,
    ],
    [
      "stale pending after paid",
      "PAID",
      "PENDING",
      "pending",
      undefined,
      "PAID",
      "PENDING",
      false,
    ],
    [
      "stale processing after paid",
      "PAID",
      "READY_FOR_PICKUP",
      "processing",
      "in_process",
      "PAID",
      "READY_FOR_PICKUP",
      false,
    ],
    [
      "pix expired",
      "PENDING",
      "PENDING",
      "expired",
      undefined,
      "EXPIRED",
      "CANCELED",
      true,
    ],
    [
      "canceled/expired",
      "PENDING",
      "PENDING",
      "canceled",
      "expired",
      "EXPIRED",
      "CANCELED",
      true,
    ],
    [
      "failed/expired",
      "PENDING",
      "PENDING",
      "failed",
      "expired",
      "EXPIRED",
      "CANCELED",
      true,
    ],
    [
      "failed",
      "PENDING",
      "PENDING",
      "failed",
      undefined,
      "FAILED",
      "CANCELED",
      true,
    ],
    [
      "canceled",
      "PENDING",
      "PENDING",
      "canceled",
      undefined,
      "CANCELED",
      "CANCELED",
      true,
    ],
    [
      "processing is unresolved",
      "PENDING",
      "PENDING",
      "processing",
      "in_review",
      "IN_REVIEW",
      "PENDING",
      true,
    ],
    [
      "action_required is unresolved",
      "PENDING",
      "PENDING",
      "action_required",
      "waiting_payment",
      "PENDING",
      "PENDING",
      false,
    ],
    [
      "action_required after processing",
      "IN_REVIEW",
      "PENDING",
      "action_required",
      "waiting_transfer",
      "IN_REVIEW",
      "PENDING",
      false,
    ],
    [
      "partial refund keeps READY",
      "PAID",
      "READY_FOR_PICKUP",
      "processed",
      "partially_refunded",
      "PARTIALLY_REFUNDED",
      "READY_FOR_PICKUP",
      true,
    ],
    [
      "refund cancels PENDING",
      "PAID",
      "PENDING",
      "refunded",
      undefined,
      "REFUNDED",
      "CANCELED",
      true,
    ],
    [
      "chargeback opened",
      "PAID",
      "READY_FOR_PICKUP",
      "charged_back",
      "in_process",
      "CHARGEBACK_IN_REVIEW",
      "READY_FOR_PICKUP",
      true,
    ],
    [
      "chargeback lost",
      "CHARGEBACK_IN_REVIEW",
      "READY_FOR_PICKUP",
      "charged_back",
      "settled",
      "CHARGEBACK_LOST",
      "READY_FOR_PICKUP",
      true,
    ],
    [
      "chargeback won",
      "CHARGEBACK_IN_REVIEW",
      "READY_FOR_PICKUP",
      "charged_back",
      "reimbursed",
      "CHARGEBACK_WON",
      "READY_FOR_PICKUP",
      true,
    ],
    [
      "processed after chargeback lost",
      "CHARGEBACK_LOST",
      "READY_FOR_PICKUP",
      "processed",
      "accredited",
      "CHARGEBACK_LOST",
      "READY_FOR_PICKUP",
      false,
    ],
    [
      "failed after expired",
      "EXPIRED",
      "CANCELED",
      "failed",
      undefined,
      "EXPIRED",
      "CANCELED",
      false,
    ],
  ])(
    "%s",
    (
      _name,
      localPayment,
      localStatus,
      status,
      detail,
      expectedPayment,
      expectedStatus,
      expectedApply,
    ) => {
      const d = sync(
        { paymentStatus: localPayment, status: localStatus },
        { status, detail },
      );
      expect(d.paymentStatus).toBe(expectedPayment);
      expect(d.fulfillmentStatus).toBe(expectedStatus);
      expect(d.apply).toBe(expectedApply);
    },
  );
});

describe("resolvePaymentSync amount and late-payment rules", () => {
  const pending = { paymentStatus: "PENDING", status: "PENDING" } as const;

  it("does not mark PAID when the provider total differs from the local total", () => {
    expect(
      sync(pending, {
        status: "processed",
        detail: "accredited",
        total: 4000,
        paid: 4000,
      }),
    ).toMatchObject({
      apply: true,
      paymentStatus: "IN_REVIEW",
      fulfillmentStatus: "PENDING",
      reviewReason: "AMOUNT_MISMATCH",
    });
  });

  it("does not mark PAID when less than the total was paid", () => {
    expect(
      sync(pending, { status: "processed", detail: "accredited", paid: 4000 }),
    ).toMatchObject({
      paymentStatus: "IN_REVIEW",
      reviewReason: "AMOUNT_MISMATCH",
    });
  });

  it("marks PAID but flags OVERPAID when the customer paid more", () => {
    expect(
      sync(pending, { status: "processed", detail: "accredited", paid: 5500 }),
    ).toMatchObject({ paymentStatus: "PAID", reviewReason: "OVERPAID" });
  });

  it("does not re-flag a duplicate mismatch notification", () => {
    expect(
      sync(
        { paymentStatus: "IN_REVIEW", status: "PENDING" },
        { status: "processed", detail: "accredited", total: 4000, paid: 4000 },
        "AMOUNT_MISMATCH",
      ).apply,
    ).toBe(false);
  });

  it("keeps a CANCELED order canceled but records the late payment", () => {
    expect(
      sync(
        { paymentStatus: "EXPIRED", status: "CANCELED" },
        { status: "processed", detail: "accredited" },
      ),
    ).toMatchObject({
      apply: true,
      paymentStatus: "PAID",
      fulfillmentStatus: "CANCELED",
      reviewReason: "LATE_PAYMENT",
    });
  });

  it("flags a late payment even if the payment status was still PENDING", () => {
    expect(
      sync(
        { paymentStatus: "PENDING", status: "CANCELED" },
        { status: "processed", detail: "accredited" },
      ),
    ).toMatchObject({
      fulfillmentStatus: "CANCELED",
      reviewReason: "LATE_PAYMENT",
    });
  });

  it("keeps the first review reason", () => {
    expect(
      sync(
        { paymentStatus: "IN_REVIEW", status: "PENDING" },
        { status: "processed", detail: "accredited", paid: 5500 },
        "AMOUNT_MISMATCH",
      ),
    ).toMatchObject({ paymentStatus: "PAID", reviewReason: "AMOUNT_MISMATCH" });
  });
});
