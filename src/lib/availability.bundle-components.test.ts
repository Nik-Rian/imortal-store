import {
  computeBundleComponentAvailability,
  type AvailabilityProductInput,
} from "@/lib/availability";
import type { ProductRecord, StockRecord } from "@/lib/order-lines";
import { buildStockKey } from "@/lib/stock-key";
import { describe, expect, it } from "vitest";

function record(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "p",
    name: "Produto",
    priceCents: 1000,
    isAvailable: true,
    controlStock: false,
    hasSizes: false,
    hasVariants: false,
    drop: { name: "Drop 1", status: "ACTIVE" },
    variants: [],
    sizes: [],
    ...overrides,
  };
}

function row(stockKey: string, onHand: number, reserved = 0): StockRecord {
  return { stockKey, onHand, reserved, isAvailable: true };
}

const SHIRT_M = buildStockKey("shirt", null, "m");
const SHIRT_G = buildStockKey("shirt", null, "g");

function shirt(
  overrides: Partial<ProductRecord> = {},
  stock: StockRecord[] = [],
) {
  return {
    ...record({
      id: "shirt",
      name: "Camisa",
      controlStock: true,
      hasSizes: true,
      sizes: [
        { id: "m", size: "M", isAvailable: true },
        { id: "g", size: "G", isAvailable: true },
      ],
      ...overrides,
    }),
    stockItems: stock,
  };
}

function kit(
  components: AvailabilityProductInput["components"],
): AvailabilityProductInput {
  return {
    ...record({ id: "kit", name: "Kit" }),
    isBundle: true,
    stockItems: [],
    components,
  };
}

const find = (
  result: ReturnType<typeof computeBundleComponentAvailability>,
  sizeId: string,
) =>
  result[0].availability.combinations.find(
    (combination) => combination.sizeId === sizeId,
  );

describe("computeBundleComponentAvailability", () => {
  it("marks an option without stock as out of stock and keeps the others purchasable", () => {
    const result = computeBundleComponentAvailability(
      kit([
        {
          quantity: 1,
          componentProduct: shirt({}, [row(SHIRT_M, 3), row(SHIRT_G, 0)]),
        },
      ]),
    );

    expect(find(result, "m")).toMatchObject({ purchasable: true });
    expect(find(result, "g")).toMatchObject({
      purchasable: false,
      reason: "OUT_OF_STOCK",
    });
    expect(result[0].availability.state).toBe("OPEN");
  });

  it("uses the units the bundle needs of the component", () => {
    const result = computeBundleComponentAvailability(
      kit([
        {
          quantity: 2,
          componentProduct: shirt({}, [row(SHIRT_M, 3, 2), row(SHIRT_G, 5)]),
        },
      ]),
    );

    expect(find(result, "m")).toMatchObject({ reason: "OUT_OF_STOCK" });
    expect(find(result, "g")).toMatchObject({ purchasable: true });
  });

  it("reports a manually unavailable size", () => {
    const result = computeBundleComponentAvailability(
      kit([
        {
          quantity: 1,
          componentProduct: shirt(
            {
              sizes: [
                { id: "m", size: "M", isAvailable: false },
                { id: "g", size: "G", isAvailable: true },
              ],
            },
            [row(SHIRT_M, 3), row(SHIRT_G, 3)],
          ),
        },
      ]),
    );

    expect(find(result, "m")).toMatchObject({ reason: "SIZE_UNAVAILABLE" });
  });

  it("ignores the component product's own listing flag", () => {
    const result = computeBundleComponentAvailability(
      kit([
        {
          quantity: 1,
          componentProduct: shirt({ isAvailable: false }, [row(SHIRT_M, 3)]),
        },
      ]),
    );

    expect(find(result, "m")).toMatchObject({ purchasable: true });
  });

  it("returns a single option for a component without variants or sizes", () => {
    const result = computeBundleComponentAvailability(
      kit([
        {
          quantity: 1,
          componentProduct: {
            ...record({ id: "sticker", name: "Adesivo" }),
            stockItems: [],
          },
        },
      ]),
    );

    expect(result[0].availability).toMatchObject({
      hasVariantOptions: false,
      hasSizeOptions: false,
      combinations: [{ variantId: null, sizeId: null, purchasable: true }],
    });
  });
});
