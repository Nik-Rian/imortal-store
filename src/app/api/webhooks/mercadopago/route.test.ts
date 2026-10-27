import { expect, test, describe, vi } from "vitest";
import { PaymentStatus } from "@/generated/prisma/client";
import { mapPaymentStatus } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

describe("Webhook Status Transitions", () => {
  test.each([
    // [Provider Status, Provider Detail, Expected PaymentStatus, Description]

    // Normal progression
    ["pending", undefined, PaymentStatus.PENDING, "pending -> PENDING"],
    ["processed", undefined, PaymentStatus.PAID, "processed -> PAID"],
    ["expired", undefined, PaymentStatus.CANCELED, "expired -> CANCELED"],
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
