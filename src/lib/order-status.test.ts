import { describe, expect, it } from "vitest";
import { OrderStatus, PaymentStatus } from "@/generated/prisma/client";
import {
  canAdminTransition,
  getAdminTransitionRule,
  nextAdminStatus,
} from "./order-status";

const orderStatuses = Object.values(OrderStatus);
const paymentStatuses = Object.values(PaymentStatus);

describe("canAdminTransition", () => {
  it.each([
    // Offered steps
    ["PENDING", "PAID", "READY_FOR_PICKUP", true],
    ["READY_FOR_PICKUP", "PAID", "COMPLETED", true],
    // Closing a ready order stays possible after a refund or chargeback
    ["READY_FOR_PICKUP", "REFUNDED", "COMPLETED", true],
    ["READY_FOR_PICKUP", "CHARGEBACK_LOST", "COMPLETED", true],
    // Unpaid orders cannot be readied
    ["PENDING", "PENDING", "READY_FOR_PICKUP", false],
    ["PENDING", "IN_REVIEW", "READY_FOR_PICKUP", false],
    // No going back, no skipping, no admin cancel
    ["COMPLETED", "PAID", "PENDING", false],
    ["READY_FOR_PICKUP", "PAID", "PENDING", false],
    ["COMPLETED", "PAID", "READY_FOR_PICKUP", false],
    ["PENDING", "PAID", "COMPLETED", false],
    ["PENDING", "PAID", "CANCELED", false],
    // A canceled order is never resurrected by an admin
    ["CANCELED", "PAID", "READY_FOR_PICKUP", false],
  ] as const)("%s / %s -> %s: %s", (current, payment, target, expected) => {
    expect(canAdminTransition(current, payment, target)).toBe(expected);
  });

  it("allows exactly the offered transitions and nothing else", () => {
    const allowed: string[] = [];
    for (const current of orderStatuses) {
      for (const payment of paymentStatuses) {
        for (const target of orderStatuses) {
          if (canAdminTransition(current, payment, target)) {
            allowed.push(`${current}/${payment}->${target}`);
          }
        }
      }
    }

    expect(allowed.sort()).toEqual(
      [
        "PENDING/PAID->READY_FOR_PICKUP",
        ...paymentStatuses.map((p) => `READY_FOR_PICKUP/${p}->COMPLETED`),
      ].sort(),
    );
  });

  it.each(["SHIPPED", "constructor", "__proto__", "toString", "", "pending"])(
    "rejects the non-enum target %j",
    (target) => {
      expect(getAdminTransitionRule(target)).toBeNull();
      expect(canAdminTransition("PENDING", "PAID", target)).toBe(false);
    },
  );

  it.each([undefined, null, 1, {}])(
    "rejects the non-string target %j",
    (target) => {
      expect(canAdminTransition("PENDING", "PAID", target)).toBe(false);
    },
  );
});

describe("nextAdminStatus", () => {
  it("offers the step the buttons show", () => {
    expect(nextAdminStatus("PENDING", "PAID")).toBe("READY_FOR_PICKUP");
    expect(nextAdminStatus("READY_FOR_PICKUP", "PAID")).toBe("COMPLETED");
    expect(nextAdminStatus("PENDING", "PENDING")).toBeNull();
    expect(nextAdminStatus("COMPLETED", "PAID")).toBeNull();
    expect(nextAdminStatus("CANCELED", "PAID")).toBeNull();
  });

  it("never offers a step that canAdminTransition rejects", () => {
    for (const current of orderStatuses) {
      for (const payment of paymentStatuses) {
        const next = nextAdminStatus(current, payment);
        if (next) expect(canAdminTransition(current, payment, next)).toBe(true);
      }
    }
  });
});
