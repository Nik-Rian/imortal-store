import { describe, expect, test, vi } from "vitest";
import { OrderStatus } from "@/generated/prisma/client";
import { determineNextOrderStatus } from "./route";

// Mock Prisma to prevent "DATABASE_URL is not defined" error during unit tests
vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

describe("Webhook Status Transitions", () => {
  const ORDER_ID = "ord_test_123";
  const LOCAL_TOTAL_CENTS = 15000; // $150.00
  const VALID_PROVIDER_AMOUNT = 150.0;
  const INVALID_PROVIDER_AMOUNT = 100.0;

  test.each([
    // [Local Status, Provider Status, Provider Amount, Expected Status, Description]

    // Normal progression
    [
      OrderStatus.PENDING,
      "processed",
      VALID_PROVIDER_AMOUNT,
      OrderStatus.PAID,
      "PENDING -> PAID on valid processed",
    ],
    [
      OrderStatus.PENDING,
      "expired",
      VALID_PROVIDER_AMOUNT,
      OrderStatus.CANCELED,
      "PENDING -> CANCELED on expired",
    ],
    [
      OrderStatus.PENDING,
      "canceled",
      VALID_PROVIDER_AMOUNT,
      OrderStatus.CANCELED,
      "PENDING -> CANCELED on canceled",
    ],
    [
      OrderStatus.PENDING,
      "failed",
      VALID_PROVIDER_AMOUNT,
      OrderStatus.CANCELED,
      "PENDING -> CANCELED on failed",
    ],

    // Forward-only protections (No regression)
    [
      OrderStatus.PAID,
      "processed",
      VALID_PROVIDER_AMOUNT,
      OrderStatus.PAID,
      "PAID ignores duplicate processed",
    ],
    [
      OrderStatus.READY_FOR_PICKUP,
      "processed",
      VALID_PROVIDER_AMOUNT,
      OrderStatus.READY_FOR_PICKUP,
      "READY_FOR_PICKUP ignores late processed",
    ],
    [
      OrderStatus.COMPLETED,
      "processed",
      VALID_PROVIDER_AMOUNT,
      OrderStatus.COMPLETED,
      "COMPLETED ignores late processed",
    ],

    // Amount mismatches
    [
      OrderStatus.PENDING,
      "processed",
      INVALID_PROVIDER_AMOUNT,
      OrderStatus.PENDING,
      "PENDING remains PENDING if amount mismatches",
    ],

    // Anomalies
    [
      OrderStatus.CANCELED,
      "processed",
      VALID_PROVIDER_AMOUNT,
      OrderStatus.CANCELED,
      "CANCELED remains CANCELED on late processed (logs warning)",
    ],
    [
      OrderStatus.PAID,
      "canceled",
      VALID_PROVIDER_AMOUNT,
      OrderStatus.PAID,
      "PAID ignores late canceled (refunds handled separately)",
    ],
])(
    "given %s and provider %s with amount %f, returns %s (%s)",
    (localStatus, mpStatus, mpAmount, expectedStatus, _description) => {
      void _description; // Clears the unused variable warning
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = determineNextOrderStatus(
        localStatus,
        mpStatus,
        mpAmount,
        LOCAL_TOTAL_CENTS,
        ORDER_ID,
      );

      expect(result).toBe(expectedStatus);

      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    },
  );
});
