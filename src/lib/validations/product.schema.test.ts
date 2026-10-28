import { describe, expect, it } from "vitest";
import { productSchema } from "./product.schema";

const base = {
  name: "Tee",
  slug: "tee",
  description: "d",
  dropId: "drop-1",
  priceCents: 1000,
};

const flagCombos = [false, true].flatMap((controlStock) =>
  [false, true].flatMap((hasSizes) =>
    [false, true].map((hasVariants) => ({
      controlStock,
      hasSizes,
      hasVariants,
    })),
  ),
);

describe("productSchema", () => {
  it.each(flagCombos)("accepts flag combination %o", (flags) => {
    const result = productSchema.safeParse({
      ...base,
      ...flags,
      sizes: flags.hasSizes ? [{ size: "P" }, { size: "M" }] : [],
      variants: flags.hasVariants ? [{ name: "Preta" }] : [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate sizes", () => {
    const result = productSchema.safeParse({
      ...base,
      sizes: [{ size: "P" }, { size: "P" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects sizes outside the allowed list", () => {
    const result = productSchema.safeParse({
      ...base,
      sizes: [{ size: "XL" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative price", () => {
    expect(productSchema.safeParse({ ...base, priceCents: -1 }).success).toBe(
      false,
    );
  });
});
