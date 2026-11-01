import { describe, expect, it } from "vitest";
import { applyBundleRules, productSchema } from "./product.schema";

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

describe("productSchema bundles", () => {
  const component = { componentProductId: "p1", quantity: 2 };

  it("accepts a bundle with components", () => {
    expect(
      productSchema.safeParse({
        ...base,
        isBundle: true,
        components: [component],
      }).success,
    ).toBe(true);
  });

  it("rejects a bundle without components", () => {
    expect(
      productSchema.safeParse({ ...base, isBundle: true, components: [] })
        .success,
    ).toBe(false);
  });

  it("rejects duplicate components", () => {
    expect(
      productSchema.safeParse({
        ...base,
        isBundle: true,
        components: [component, { ...component, quantity: 1 }],
      }).success,
    ).toBe(false);
  });

  it.each([0, -1, 1.5])("rejects component quantity %s", (quantity) => {
    expect(
      productSchema.safeParse({
        ...base,
        isBundle: true,
        components: [{ ...component, quantity }],
      }).success,
    ).toBe(false);
  });
});

describe("applyBundleRules", () => {
  const component = { componentProductId: "p1", quantity: 2 };

  it("forces stock, size and variant settings off for a bundle", () => {
    const parsed = productSchema.parse({
      ...base,
      isBundle: true,
      controlStock: true,
      hasSizes: true,
      hasVariants: true,
      sizes: [{ size: "P" }],
      variants: [{ name: "Preta" }],
      components: [component],
    });
    const result = applyBundleRules(parsed);
    expect(result).toMatchObject({
      controlStock: false,
      hasSizes: false,
      hasVariants: false,
      sizes: [],
      variants: [],
    });
    expect(result.components).toEqual([component]);
  });

  it("drops components from an ordinary product", () => {
    const parsed = productSchema.parse({
      ...base,
      controlStock: true,
      components: [component],
    });
    const result = applyBundleRules(parsed);
    expect(result.components).toEqual([]);
    expect(result.controlStock).toBe(true);
  });
});
