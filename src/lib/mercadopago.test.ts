import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyMercadoPagoSignature } from "./mercadopago";

const SECRET = "test-webhook-secret";
const ORDER_ID = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
const REQUEST_ID = "req-123";
const TS = "1742505638683";

const sign = (manifestId: string, secret = SECRET) =>
  crypto
    .createHmac("sha256", secret)
    .update(`id:${manifestId};request-id:${REQUEST_ID};ts:${TS};`)
    .digest("hex");

type Options = Parameters<typeof verifyMercadoPagoSignature>[0];

const verify = (overrides: Partial<Options> = {}) =>
  verifyMercadoPagoSignature({
    xSignatureHeader: `ts=${TS},v1=${sign(ORDER_ID.toLowerCase())}`,
    xRequestIdHeader: REQUEST_ID,
    dataId: ORDER_ID,
    webhookSecret: SECRET,
    ...overrides,
  });

describe("verifyMercadoPagoSignature", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a signature computed over the lowercased order id", () => {
    expect(verify()).toBe(true);
  });

  it("rejects a signature computed over the original-case order id", () => {
    expect(verify({ xSignatureHeader: `ts=${TS},v1=${sign(ORDER_ID)}` })).toBe(
      false,
    );
  });

  it("rejects a signature made with another secret", () => {
    expect(
      verify({
        xSignatureHeader: `ts=${TS},v1=${sign(ORDER_ID.toLowerCase(), "other")}`,
      }),
    ).toBe(false);
  });

  it("rejects when data.id, request-id or ts differ from what was signed", () => {
    expect(verify({ dataId: "ORD01OTHER" })).toBe(false);
    expect(verify({ xRequestIdHeader: "req-456" })).toBe(false);
    expect(
      verify({
        xSignatureHeader: `ts=999,v1=${sign(ORDER_ID.toLowerCase())}`,
      }),
    ).toBe(false);
  });

  it.each([
    ["x-signature header", { xSignatureHeader: null }],
    ["x-request-id header", { xRequestIdHeader: null }],
    ["data.id", { dataId: null }],
    ["webhook secret", { webhookSecret: "" }],
  ] as [string, Partial<Options>][])(
    "rejects when the %s is missing",
    (_n, o) => {
      expect(verify(o)).toBe(false);
    },
  );

  it.each(["not-hex", "abcd", ""])(
    "rejects a malformed v1 hash (%j) without logging an error",
    (badHash) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(verify({ xSignatureHeader: `ts=${TS},v1=${badHash}` })).toBe(
        false,
      );
      expect(error).not.toHaveBeenCalled();
    },
  );
});
