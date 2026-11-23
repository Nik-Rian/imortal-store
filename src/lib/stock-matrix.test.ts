import { describe, expect, it } from "vitest";
import {
  buildSellableCombinations,
  describeCombination,
  mapStockItemsToRows,
  renameVariantInStockRows,
  stockRowKey,
} from "./stock-matrix";

describe("buildSellableCombinations", () => {
  it("returns a single product-level combination without options", () => {
    expect(
      buildSellableCombinations({
        hasVariants: false,
        variantNames: [],
        hasSizes: false,
        sizeLabels: [],
      }),
    ).toEqual([{ variantName: null, sizeLabel: null }]);
  });

  it("returns one combination per variant", () => {
    expect(
      buildSellableCombinations({
        hasVariants: true,
        variantNames: ["Preta", "Branca"],
        hasSizes: false,
        sizeLabels: ["P"],
      }),
    ).toEqual([
      { variantName: "Preta", sizeLabel: null },
      { variantName: "Branca", sizeLabel: null },
    ]);
  });

  it("returns one combination per size", () => {
    expect(
      buildSellableCombinations({
        hasVariants: false,
        variantNames: ["Preta"],
        hasSizes: true,
        sizeLabels: ["P", "M"],
      }),
    ).toEqual([
      { variantName: null, sizeLabel: "P" },
      { variantName: null, sizeLabel: "M" },
    ]);
  });

  it("returns the variant x size product", () => {
    const result = buildSellableCombinations({
      hasVariants: true,
      variantNames: ["Preta", "Branca"],
      hasSizes: true,
      sizeLabels: ["P", "M"],
    });
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ variantName: "Preta", sizeLabel: "P" });
  });

  it("ignores a flagged dimension that has no options", () => {
    expect(
      buildSellableCombinations({
        hasVariants: true,
        variantNames: [],
        hasSizes: true,
        sizeLabels: [],
      }),
    ).toEqual([{ variantName: null, sizeLabel: null }]);
  });

  it("drops blank and duplicate names", () => {
    expect(
      buildSellableCombinations({
        hasVariants: true,
        variantNames: ["Preta", "", "Preta"],
        hasSizes: false,
        sizeLabels: [],
      }),
    ).toEqual([{ variantName: "Preta", sizeLabel: null }]);
  });
});

describe("stock row helpers", () => {
  it("produces distinct keys that do not collide on separators", () => {
    expect(stockRowKey({ variantName: "a#b", sizeLabel: null })).not.toBe(
      stockRowKey({ variantName: "a", sizeLabel: "b" }),
    );
  });

  it("describes each combination shape", () => {
    expect(describeCombination({ variantName: null, sizeLabel: null })).toBe(
      "Produto",
    );
    expect(describeCombination({ variantName: "Preta", sizeLabel: "P" })).toBe(
      "Preta / P",
    );
  });

  it("maps persisted rows back to names and labels", () => {
    const rows = mapStockItemsToRows(
      [
        {
          variantId: "v1",
          sizeId: "s1",
          onHand: 4,
          reserved: 1,
          isAvailable: false,
        },
        {
          variantId: "gone",
          sizeId: null,
          onHand: 9,
          reserved: 0,
          isAvailable: true,
        },
      ],
      [{ id: "v1", name: "Preta" }],
      [{ id: "s1", size: "P" }],
    );
    expect(rows).toEqual({
      [stockRowKey({ variantName: "Preta", sizeLabel: "P" })]: {
        onHand: 4,
        reserved: 1,
        isAvailable: false,
      },
    });
  });

  it("moves values to the new name when a variant is renamed", () => {
    const rows = {
      [stockRowKey({ variantName: "Preta", sizeLabel: "P" })]: {
        onHand: 4,
        reserved: 0,
        isAvailable: true,
      },
    };
    const renamed = renameVariantInStockRows(rows, "Preta", "Preto");
    expect(Object.keys(renamed)).toEqual([
      stockRowKey({ variantName: "Preto", sizeLabel: "P" }),
    ]);
  });
});
