import { describe, expect, it } from "vitest";
import { PaymentRejectedError, describeCardFailure } from "./card-outcome";

describe("describeCardFailure", () => {
  it.each([
    "rejected_by_issuer",
    "required_call_for_authorize",
    "card_insufficient_amount",
    "amount_limit_exceeded",
    "card_disabled",
    "bad_filled_card_data",
    "invalid_card_token",
    "invalid_installments",
    "high_risk",
    "max_attempts_exceeded",
    "processing_error",
  ])("has a specific message for %s", (detail) => {
    const message = describeCardFailure(detail);
    expect(message).not.toBe(describeCardFailure(undefined));
    expect(message).not.toContain(detail);
  });

  it("falls back to a generic message for unknown or missing details", () => {
    const fallback = describeCardFailure(undefined);
    expect(describeCardFailure(null)).toBe(fallback);
    expect(describeCardFailure("something_new")).toBe(fallback);
    expect(describeCardFailure("constructor")).toBe(fallback);
  });
});

describe("PaymentRejectedError", () => {
  it("keeps the provider reason", () => {
    const error = new PaymentRejectedError("boom", "rejected_by_issuer");
    expect(error).toBeInstanceOf(Error);
    expect(error.statusDetail).toBe("rejected_by_issuer");
  });
});
