import { expect, test, describe } from "vitest";
import { mapPaymentStatus } from "@/app/api/webhooks/mercadopago/route";

describe("Webhook Payment Status Mapping", () => {
  test("maps 'processed' to PAID", () => {
    const status = mapPaymentStatus("processed");
    expect(status).toBe("PAID");
  });

  test("maps 'approved' to PAID", () => {
    const status = mapPaymentStatus("approved");
    expect(status).toBe("PAID");
  });

  test("maps 'refunded' to REFUNDED", () => {
    const status = mapPaymentStatus("refunded");
    expect(status).toBe("REFUNDED");
  });

  test("maps 'charged_back' with in_process detail to CHARGEBACK_IN_REVIEW", () => {
    const status = mapPaymentStatus("charged_back", "in_process");
    expect(status).toBe("CHARGEBACK_IN_REVIEW");
  });

  test("maps 'failed' to FAILED", () => {
    const status = mapPaymentStatus("failed");
    expect(status).toBe("FAILED");
  });

  test("defaults unknown status to PENDING", () => {
    const status = mapPaymentStatus("unknown_weird_status");
    expect(status).toBe("PENDING");
  });
});
