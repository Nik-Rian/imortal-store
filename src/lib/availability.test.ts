import {
  computeProductAvailability,
  getVariantState,
  isSizePurchasable,
  isVariantPurchasable,
  type AvailabilityComponentInput,
  type AvailabilityProductInput,
} from "@/lib/availability";
import type { StockRecord } from "@/lib/order-lines";
import { buildStockKey } from "@/lib/stock-key";
import { describe, expect, it } from "vitest";

function makeProduct(
  overrides: Partial<AvailabilityProductInput> = {},
): AvailabilityProductInput {
  return {
    id: "p1",
    name: "Camiseta",
    priceCents: 5000,
    isAvailable: true,
    controlStock: false,
    hasSizes: false,
    hasVariants: false,
    isBundle: false,
    drop: { name: "Drop", status: "ACTIVE" },
    variants: [],
    sizes: [],
    stockItems: [],
    components: [],
    ...overrides,
  };
}

function stockRow(
  productId: string,
  variantId: string | null,
  sizeId: string | null,
  onHand: number,
  reserved = 0,
  isAvailable = true,
): StockRecord {
  return {
    stockKey: buildStockKey(productId, variantId, sizeId),
    onHand,
    reserved,
    isAvailable,
  };
}

const sizes = [
  { id: "s1", size: "P", isAvailable: true },
  { id: "s2", size: "M", isAvailable: true },
];

describe("computeProductAvailability", () => {
  it("is closed when the listing flag is off, even with stock", () => {
    const result = computeProductAvailability(
      makeProduct({
        isAvailable: false,
        controlStock: true,
        stockItems: [stockRow("p1", null, null, 10)],
      }),
    );

    expect(result.state).toBe("CLOSED");
    expect(result.combinations.every((c) => !c.purchasable)).toBe(true);
  });

  it("is open without a ceiling for an untracked product", () => {
    const result = computeProductAvailability(makeProduct());

    expect(result.state).toBe("OPEN");
    expect(result.combinations).toEqual([
      {
        variantId: null,
        sizeId: null,
        purchasable: true,
        reason: null,
        maxQuantity: null,
      },
    ]);
  });

  it("is closed, never sold out, when an untracked product has every size flagged off", () => {
    const result = computeProductAvailability(
      makeProduct({
        hasSizes: true,
        sizes: sizes.map((size) => ({ ...size, isAvailable: false })),
      }),
    );

    expect(result.state).toBe("CLOSED");
  });

  it("uses onHand minus reserved as the ceiling of a tracked combination", () => {
    const result = computeProductAvailability(
      makeProduct({
        controlStock: true,
        stockItems: [stockRow("p1", null, null, 5, 2)],
      }),
    );

    expect(result.state).toBe("OPEN");
    expect(result.combinations[0].maxQuantity).toBe(3);
  });

  it.each([
    ["no stock row", []],
    ["everything reserved", [stockRow("p1", null, null, 2, 2)]],
    ["row withdrawn manually", [stockRow("p1", null, null, 9, 0, false)]],
  ])("is sold out for a tracked product with %s", (_label, stockItems) => {
    const result = computeProductAvailability(
      makeProduct({ controlStock: true, stockItems }),
    );

    expect(result.state).toBe("SOLD_OUT");
  });

  it("keeps the product open and disables only the sold-out size", () => {
    const result = computeProductAvailability(
      makeProduct({
        controlStock: true,
        hasSizes: true,
        sizes,
        stockItems: [
          stockRow("p1", null, "s1", 2),
          stockRow("p1", null, "s2", 0),
        ],
      }),
    );

    expect(result.state).toBe("OPEN");
    expect(isSizePurchasable(result, null, "s1")).toBe(true);
    expect(isSizePurchasable(result, null, "s2")).toBe(false);
  });

  it("is sold out when every size is at zero", () => {
    const result = computeProductAvailability(
      makeProduct({
        controlStock: true,
        hasSizes: true,
        sizes,
        stockItems: [
          stockRow("p1", null, "s1", 0),
          stockRow("p1", null, "s2", 0),
        ],
      }),
    );

    expect(result.state).toBe("SOLD_OUT");
  });

  it("evaluates each variant on its own", () => {
    const result = computeProductAvailability(
      makeProduct({
        controlStock: true,
        hasVariants: true,
        variants: [
          { id: "v1", name: "Preta", isAvailable: true },
          { id: "v2", name: "Branca", isAvailable: true },
          { id: "v3", name: "Azul", isAvailable: false },
        ],
        stockItems: [
          stockRow("p1", "v1", null, 0),
          stockRow("p1", "v2", null, 5),
          stockRow("p1", "v3", null, 5),
        ],
      }),
    );

    expect(result.state).toBe("OPEN");
    expect(getVariantState(result, "v1")).toBe("SOLD_OUT");
    expect(getVariantState(result, "v2")).toBe("OPEN");
    expect(getVariantState(result, "v3")).toBe("CLOSED");
    expect(isVariantPurchasable(result, "v2")).toBe(true);
    expect(isVariantPurchasable(result, "v1")).toBe(false);
  });
});

describe("computeProductAvailability for bundles", () => {
  function makeComponent(
    stockItems: StockRecord[],
    quantity = 1,
  ): AvailabilityComponentInput {
    return {
      quantity,
      componentProduct: {
        id: "c1",
        name: "Short",
        priceCents: 3000,
        isAvailable: true,
        controlStock: true,
        hasSizes: true,
        hasVariants: false,
        drop: { name: "Drop", status: "ACTIVE" },
        variants: [],
        sizes,
        stockItems,
      },
    };
  }

  const bundle = (component: AvailabilityComponentInput) =>
    makeProduct({ id: "b1", isBundle: true, components: [component] });

  it("is open when each component has a buyable option", () => {
    const result = computeProductAvailability(
      bundle(
        makeComponent([
          stockRow("c1", null, "s1", 0),
          stockRow("c1", null, "s2", 4),
        ]),
      ),
    );

    expect(result.state).toBe("OPEN");
  });

  it("is sold out when a required component has no buyable option", () => {
    const result = computeProductAvailability(
      bundle(
        makeComponent([
          stockRow("c1", null, "s1", 0),
          stockRow("c1", null, "s2", 0),
        ]),
      ),
    );

    expect(result.state).toBe("SOLD_OUT");
  });

  it("is sold out when the component needs more units than are available", () => {
    const result = computeProductAvailability(
      bundle(
        makeComponent(
          [stockRow("c1", null, "s1", 1), stockRow("c1", null, "s2", 1)],
          2,
        ),
      ),
    );

    expect(result.state).toBe("SOLD_OUT");
  });

  it("is closed when the bundle listing itself is closed", () => {
    const result = computeProductAvailability({
      ...bundle(makeComponent([stockRow("c1", null, "s1", 5)])),
      isAvailable: false,
    });

    expect(result.state).toBe("CLOSED");
  });

  it("has no ceiling when the bundle is untracked", () => {
    const result = computeProductAvailability(
      bundle(makeComponent([stockRow("c1", null, "s1", 5)])),
    );

    expect(result.combinations[0].maxQuantity).toBeNull();
  });
});
