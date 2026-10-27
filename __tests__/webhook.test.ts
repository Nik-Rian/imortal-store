import { expect, test, describe, vi } from "vitest";
import { determineNextOrderStatus } from "@/app/api/webhooks/mercadopago/route";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

describe("Webhook Critical Path: Repeated Payment Events", () => {
  test("processes valid payment exactly once from PENDING", () => {
    const status = determineNextOrderStatus(
      "PENDING",
      "processed",
      100,
      10000,
      "ORD-123",
    );
    expect(status).toBe("PAID");
  });

  test("ignores 'processed' event if order is already PAID (Forward-only)", () => {
    const status = determineNextOrderStatus(
      "PAID",
      "processed",
      100,
      10000,
      "ORD-123",
    );
    expect(status).toBe("PAID");
  });

  test("ignores 'processed' event if order is already CANCELED", () => {
    const status = determineNextOrderStatus(
      "CANCELED",
      "processed",
      100,
      10000,
      "ORD-123",
    );
    expect(status).toBe("CANCELED"); // Preserves terminal state
  });

  test("rejects webhook if amounts mismatch", () => {
    const status = determineNextOrderStatus(
      "PENDING",
      "processed",
      50,
      10000,
      "ORD-123",
    );
    expect(status).toBe("PENDING");
  });

  test("cancels PENDING order on failure", () => {
    const status = determineNextOrderStatus(
      "PENDING",
      "failed",
      100,
      10000,
      "ORD-123",
    );
    expect(status).toBe("CANCELED");
  });
});
