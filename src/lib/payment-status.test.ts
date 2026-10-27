import { describe, expect, it } from "vitest";
import { resolveFulfillmentStatus } from "./payment-status";

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
