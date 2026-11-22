import type { OrderStatus, PaymentStatus } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";
import {
  classifyOrdersForConclusion,
  getBlockingReason,
  isAcknowledgeable,
} from "./drop-conclusion";

type Expected = "blocking" | "acknowledge" | "none";

const sameFor = (value: Expected): Record<OrderStatus, Expected> => ({
  PENDING: value,
  PREPARING: value,
  READY_FOR_PICKUP: value,
  COMPLETED: value,
  CANCELED: value,
});

const unfulfilledAcknowledge: Record<OrderStatus, Expected> = {
  PENDING: "acknowledge",
  PREPARING: "acknowledge",
  READY_FOR_PICKUP: "acknowledge",
  COMPLETED: "none",
  CANCELED: "none",
};

// Record<PaymentStatus, ...> makes the compiler reject a missing payment status.
const EXPECTED: Record<PaymentStatus, Record<OrderStatus, Expected>> = {
  PENDING: sameFor("blocking"),
  IN_REVIEW: sameFor("blocking"),
  PAID: { ...unfulfilledAcknowledge, CANCELED: "blocking" },
  FAILED: sameFor("none"),
  EXPIRED: sameFor("none"),
  CANCELED: sameFor("none"),
  PARTIALLY_REFUNDED: unfulfilledAcknowledge,
  REFUNDED: sameFor("none"),
  CHARGEBACK_IN_REVIEW: sameFor("blocking"),
  CHARGEBACK_LOST: sameFor("none"),
  CHARGEBACK_WON: sameFor("none"),
};

const cases = (Object.keys(EXPECTED) as PaymentStatus[]).flatMap(
  (paymentStatus) =>
    (Object.keys(EXPECTED[paymentStatus]) as OrderStatus[]).map((status) => ({
      paymentStatus,
      status,
      expected: EXPECTED[paymentStatus][status],
    })),
);

describe("drop conclusion rules", () => {
  it("covers every payment and fulfilment combination", () => {
    expect(cases).toHaveLength(55);
  });

  it.each(cases)(
    "$paymentStatus + $status is $expected",
    ({ paymentStatus, status, expected }) => {
      const order = { paymentStatus, status };

      expect(getBlockingReason(order) !== null).toBe(expected === "blocking");
      expect(isAcknowledgeable(order)).toBe(expected === "acknowledge");
    },
  );

  it("names the blocking reason", () => {
    expect(
      getBlockingReason({ paymentStatus: "PENDING", status: "PENDING" }),
    ).toBe("PAYMENT_PENDING");
    expect(
      getBlockingReason({ paymentStatus: "IN_REVIEW", status: "PENDING" }),
    ).toBe("PAYMENT_IN_REVIEW");
    expect(
      getBlockingReason({
        paymentStatus: "CHARGEBACK_IN_REVIEW",
        status: "COMPLETED",
      }),
    ).toBe("CHARGEBACK_IN_REVIEW");
    expect(
      getBlockingReason({ paymentStatus: "PAID", status: "CANCELED" }),
    ).toBe("LATE_PAYMENT");
  });

  it("splits a mixed list into disjoint blocking and acknowledgeable sets", () => {
    const orders = [
      { id: "a", paymentStatus: "PENDING", status: "PENDING" },
      { id: "b", paymentStatus: "PAID", status: "READY_FOR_PICKUP" },
      { id: "c", paymentStatus: "PAID", status: "COMPLETED" },
      { id: "d", paymentStatus: "PAID", status: "CANCELED" },
      { id: "e", paymentStatus: "FAILED", status: "CANCELED" },
    ] as const;

    const { blocking, acknowledgeable } = classifyOrdersForConclusion(orders);

    expect(blocking.map((o) => [o.id, o.blockingReason])).toEqual([
      ["a", "PAYMENT_PENDING"],
      ["d", "LATE_PAYMENT"],
    ]);
    expect(acknowledgeable.map((o) => o.id)).toEqual(["b"]);
  });
});
