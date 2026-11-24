import { buildStockKey } from "@/lib/stock-key";
import { describe, expect, it } from "vitest";
import {
  aggregateStockDemand,
  buildOrderSnapshots,
  evaluateAvailability,
  resolveOrderLines,
  type Catalogue,
  type CatalogueProduct,
  type OrderLineInput,
  type StockRecord,
} from "./order-lines";

function product(overrides: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: "p1",
    name: "Produto",
    priceCents: 1000,
    isAvailable: true,
    controlStock: false,
    hasSizes: false,
    hasVariants: false,
    isBundle: false,
    drop: { name: "Drop 1", status: "ACTIVE" },
    variants: [],
    sizes: [],
    components: [],
    ...overrides,
  };
}

function stockRow(
  stockKey: string,
  onHand: number,
  overrides: Partial<StockRecord> = {},
): StockRecord {
  return { stockKey, onHand, reserved: 0, isAvailable: true, ...overrides };
}

function catalogueOf(
  products: CatalogueProduct[],
  stock: StockRecord[] = [],
): Catalogue {
  return {
    products: new Map(products.map((p) => [p.id, p] as const)),
    stock: new Map(stock.map((s) => [s.stockKey, s] as const)),
  };
}

function resolve(inputs: OrderLineInput[], catalogue: Catalogue) {
  const result = resolveOrderLines(inputs, catalogue);
  if (!result.ok) throw new Error(result.error);
  return result.lines;
}

function evaluate(inputs: OrderLineInput[], catalogue: Catalogue) {
  return evaluateAvailability(resolve(inputs, catalogue), catalogue.stock);
}

function errorOf(inputs: OrderLineInput[], catalogue: Catalogue) {
  const result = resolveOrderLines(inputs, catalogue);
  return result.ok ? null : result.error;
}

const shirt = product({
  id: "shirt",
  name: "Camisa",
  priceCents: 5000,
  controlStock: true,
  hasSizes: true,
  sizes: [
    { id: "m", size: "M", isAvailable: true },
    { id: "g", size: "G", isAvailable: true },
  ],
});

const cap = product({
  id: "cap",
  name: "Boné",
  priceCents: 3000,
  controlStock: true,
  hasVariants: true,
  variants: [{ id: "blue", name: "Azul", isAvailable: true }],
});

const kit = product({
  id: "kit",
  name: "Kit Calouro",
  priceCents: 12000,
  isBundle: true,
  components: [
    { componentProductId: "cap", quantity: 1 },
    { componentProductId: "shirt", quantity: 1 },
  ],
});

const SHIRT_M = buildStockKey("shirt", null, "m");
const CAP_BLUE = buildStockKey("cap", "blue", null);

const kitSelection = [
  { componentProductId: "cap", variantId: "blue" },
  { componentProductId: "shirt", sizeId: "m" },
];
const kitLine = (quantity = 1): OrderLineInput => ({
  productId: "kit",
  quantity,
  components: kitSelection,
});
const shirtLine = (quantity = 1): OrderLineInput => ({
  productId: "shirt",
  sizeId: "m",
  quantity,
});
const fullStock = () => [stockRow(SHIRT_M, 5), stockRow(CAP_BLUE, 5)];

describe("resolveOrderLines", () => {
  it("finds the product of a variant-only line", () => {
    const tee = product({
      id: "tee",
      hasVariants: true,
      variants: [{ id: "black", name: "Preta", isAvailable: true }],
    });
    const [line] = resolve(
      [{ variantId: "black", quantity: 2 }],
      catalogueOf([tee]),
    );
    expect(line.product.id).toBe("tee");
    expect(line.variant?.name).toBe("Preta");
    expect(line.quantity).toBe(2);
  });

  it("rejects a variant that belongs to another product than the line", () => {
    const tee = product({
      id: "tee",
      variants: [{ id: "black", name: "Preta", isAvailable: true }],
    });
    expect(
      errorOf(
        [{ productId: "other", variantId: "black", quantity: 1 }],
        catalogueOf([tee]),
      ),
    ).toMatch(/não pertence/);
  });

  it("rejects unknown products and unknown variants", () => {
    expect(
      errorOf([{ productId: "ghost", quantity: 1 }], catalogueOf([])),
    ).toMatch(/não foram encontrados/);
    expect(
      errorOf([{ variantId: "ghost", quantity: 1 }], catalogueOf([])),
    ).toMatch(/não foram encontrados/);
  });

  it("rejects a line without product or variant", () => {
    expect(errorOf([{ quantity: 1 }], catalogueOf([]))).toMatch(
      /não especificado/,
    );
  });

  it("ignores an unknown size id on a plain line", () => {
    const [line] = resolve(
      [{ productId: "p1", sizeId: "stale", quantity: 1 }],
      catalogueOf([product()]),
    );
    expect(line.size).toBeNull();
  });

  it("resolves the bundle components in the bundle order with their quantity", () => {
    const [line] = resolve(
      [
        {
          productId: "kit",
          quantity: 1,
          components: [...kitSelection].reverse(),
        },
      ],
      catalogueOf([kit, cap, shirt]),
    );
    expect(line.components.map((c) => c.product.id)).toEqual(["cap", "shirt"]);
    expect(line.components.map((c) => c.quantity)).toEqual([1, 1]);
    expect(line.components[0].variant?.name).toBe("Azul");
    expect(line.components[1].size?.size).toBe("M");
  });

  const invalidSelections: [
    string,
    (
      | { componentProductId: string; variantId?: string; sizeId?: string }[]
      | undefined
    ),
    RegExp,
  ][] = [
    ["no components", undefined, /Selecione as opções de todos/],
    [
      "a missing component",
      [{ componentProductId: "cap", variantId: "blue" }],
      /Selecione as opções de todos/,
    ],
    [
      "a product that is not part of the kit",
      [...kitSelection, { componentProductId: "other" }],
      /não faz parte do kit/,
    ],
    [
      "a duplicated component",
      [
        { componentProductId: "cap", variantId: "blue" },
        { componentProductId: "cap", variantId: "blue" },
      ],
      /uma única vez/,
    ],
    [
      "a variant of another product",
      [
        { componentProductId: "cap", variantId: "other-variant" },
        { componentProductId: "shirt", sizeId: "m" },
      ],
      /não pertence/,
    ],
    [
      "a size of another product",
      [
        { componentProductId: "cap", variantId: "blue" },
        { componentProductId: "shirt", sizeId: "other-size" },
      ],
      /não pertence/,
    ],
    [
      "no variant for a component with variants",
      [
        { componentProductId: "cap" },
        { componentProductId: "shirt", sizeId: "m" },
      ],
      /Selecione a variação/,
    ],
    [
      "no size for a component with sizes",
      [
        { componentProductId: "cap", variantId: "blue" },
        { componentProductId: "shirt" },
      ],
      /Selecione o tamanho/,
    ],
    [
      "a variant for a component without variants",
      [
        { componentProductId: "cap", variantId: "blue" },
        { componentProductId: "shirt", sizeId: "m", variantId: "blue" },
      ],
      /não pertence/,
    ],
  ];

  it.each(invalidSelections)(
    "rejects a bundle line with %s",
    (_label, components, expected) => {
      expect(
        errorOf(
          [{ productId: "kit", quantity: 1, components }],
          catalogueOf([kit, cap, shirt]),
        ),
      ).toMatch(expected);
    },
  );

  it("rejects component selections on a line that is not a bundle", () => {
    expect(
      errorOf(
        [
          {
            productId: "shirt",
            sizeId: "m",
            quantity: 1,
            components: [{ componentProductId: "cap", variantId: "blue" }],
          },
        ],
        catalogueOf([shirt, cap]),
      ),
    ).toMatch(/não é um kit/);
  });
});

describe("aggregateStockDemand", () => {
  const catalogue = catalogueOf([kit, cap, shirt], fullStock());

  it("sums a plain line and a bundle component that share a stock key", () => {
    const demand = aggregateStockDemand(
      resolve([shirtLine(2), kitLine(3)], catalogue),
    );
    const shirtDemand = demand.find((d) => d.stockKey === SHIRT_M);
    expect(shirtDemand?.quantity).toBe(5);
    expect(shirtDemand?.contributions.map((c) => c.quantity)).toEqual([2, 3]);
    expect(demand.find((d) => d.stockKey === CAP_BLUE)?.quantity).toBe(3);
  });

  it("multiplies the quantity per bundle unit by the line quantity", () => {
    const doubleKit = product({
      ...kit,
      components: [
        { componentProductId: "cap", quantity: 2 },
        { componentProductId: "shirt", quantity: 1 },
      ],
    });
    const demand = aggregateStockDemand(
      resolve([kitLine(3)], catalogueOf([doubleKit, cap, shirt])),
    );
    expect(demand.find((d) => d.stockKey === CAP_BLUE)?.quantity).toBe(6);
  });

  it("keeps different stock keys apart and skips products without stock control", () => {
    const free = product({ id: "free" });
    const demand = aggregateStockDemand(
      resolve(
        [
          shirtLine(1),
          { productId: "shirt", sizeId: "g", quantity: 1 },
          { productId: "free", quantity: 4 },
        ],
        catalogueOf([shirt, free]),
      ),
    );
    expect(demand.map((d) => d.stockKey).sort()).toEqual(
      [SHIRT_M, buildStockKey("shirt", null, "g")].sort(),
    );
  });

  it("ignores a stale variant id when the product does not use variants", () => {
    const plain = product({ id: "plain", controlStock: true });
    const demand = aggregateStockDemand(
      resolve(
        [{ productId: "plain", quantity: 1, sizeId: "stale" }],
        catalogueOf([plain]),
      ),
    );
    expect(demand[0].stockKey).toBe(buildStockKey("plain", null, null));
  });
});

describe("evaluateAvailability", () => {
  const base = () => catalogueOf([kit, cap, shirt], fullStock());

  it("accepts a plain line and a bundle whose stock covers them", () => {
    expect(evaluate([shirtLine(1)], base())).toBeNull();
    expect(evaluate([kitLine(2)], base())).toBeNull();
  });

  it("rejects a plain line whose drop is concluded", () => {
    const ended = { ...shirt, drop: { name: "Drop 1", status: "CONCLUDED" } };
    expect(
      evaluate([shirtLine()], catalogueOf([ended], fullStock())),
    ).toMatchObject({ reason: "DROP_ENDED", bundleName: null });
  });

  it("rejects a plain line whose listing is closed", () => {
    const closed = { ...shirt, isAvailable: false };
    expect(
      evaluate([shirtLine()], catalogueOf([closed], fullStock())),
    ).toMatchObject({ reason: "PRODUCT_UNAVAILABLE" });
  });

  it("rejects a missing or manually withdrawn stock row", () => {
    expect(evaluate([shirtLine()], catalogueOf([shirt], []))).toMatchObject({
      reason: "OUT_OF_STOCK",
    });
    expect(
      evaluate(
        [shirtLine()],
        catalogueOf([shirt], [stockRow(SHIRT_M, 10, { isAvailable: false })]),
      ),
    ).toMatchObject({ reason: "OUT_OF_STOCK" });
  });

  it("uses onHand minus reserved", () => {
    const stock = [stockRow(SHIRT_M, 5, { reserved: 4 })];
    expect(evaluate([shirtLine(1)], catalogueOf([shirt], stock))).toBeNull();
    expect(evaluate([shirtLine(2)], catalogueOf([shirt], stock))).toMatchObject(
      { reason: "OUT_OF_STOCK" },
    );
  });

  it("rejects a bundle line whose own listing is closed", () => {
    const closedKit = { ...kit, isAvailable: false };
    expect(
      evaluate([kitLine()], catalogueOf([closedKit, cap, shirt], fullStock())),
    ).toMatchObject({
      reason: "PRODUCT_UNAVAILABLE",
      productName: "Kit Calouro",
      bundleName: null,
    });
  });

  it("still orders a bundle whose component product is closed for sale", () => {
    const closedShirt = { ...shirt, isAvailable: false };
    expect(
      evaluate([kitLine()], catalogueOf([kit, cap, closedShirt], fullStock())),
    ).toBeNull();
  });

  it("names the bundle and the component option when a component fails", () => {
    const noBlueCap = {
      ...cap,
      variants: [{ id: "blue", name: "Azul", isAvailable: false }],
    };
    expect(
      evaluate([kitLine()], catalogueOf([kit, noBlueCap, shirt], fullStock())),
    ).toMatchObject({
      reason: "VARIANT_UNAVAILABLE",
      productName: "Boné",
      variantName: "Azul",
      bundleName: "Kit Calouro",
    });

    const noMShirt = {
      ...shirt,
      sizes: [
        { id: "m", size: "M", isAvailable: false },
        { id: "g", size: "G", isAvailable: true },
      ],
    };
    expect(
      evaluate([kitLine()], catalogueOf([kit, cap, noMShirt], fullStock())),
    ).toMatchObject({
      reason: "SIZE_UNAVAILABLE",
      sizeLabel: "M",
      bundleName: "Kit Calouro",
    });

    const ended = { ...cap, drop: { name: "Drop 1", status: "CONCLUDED" } };
    expect(
      evaluate([kitLine()], catalogueOf([kit, ended, shirt], fullStock())),
    ).toMatchObject({ reason: "DROP_ENDED", bundleName: "Kit Calouro" });
  });

  it("rejects a bundle when one component combination has no stock", () => {
    expect(
      evaluate(
        [kitLine()],
        catalogueOf([kit, cap, shirt], [stockRow(SHIRT_M, 5)]),
      ),
    ).toMatchObject({
      reason: "OUT_OF_STOCK",
      productName: "Boné",
      bundleName: "Kit Calouro",
    });
  });

  it("scales component demand with the bundle quantity", () => {
    const stock = [stockRow(SHIRT_M, 1), stockRow(CAP_BLUE, 5)];
    expect(
      evaluate([kitLine(1)], catalogueOf([kit, cap, shirt], stock)),
    ).toBeNull();
    expect(
      evaluate([kitLine(2)], catalogueOf([kit, cap, shirt], stock)),
    ).toMatchObject({ reason: "OUT_OF_STOCK", productName: "Camisa" });
  });

  it("combines the demand of a bundle and one of its components", () => {
    const tight = catalogueOf(
      [kit, cap, shirt],
      [stockRow(SHIRT_M, 1), stockRow(CAP_BLUE, 5)],
    );
    expect(evaluate([shirtLine(1)], tight)).toBeNull();
    expect(evaluate([kitLine(1)], tight)).toBeNull();
    expect(evaluate([shirtLine(1), kitLine(1)], tight)).toMatchObject({
      reason: "OUT_OF_STOCK",
      productName: "Camisa",
      sizeLabel: "M",
      bundleName: "Kit Calouro",
    });
    expect(evaluate([kitLine(1), shirtLine(1)], tight)).toMatchObject({
      reason: "OUT_OF_STOCK",
      productName: "Camisa",
      bundleName: null,
    });

    const enough = catalogueOf(
      [kit, cap, shirt],
      [stockRow(SHIRT_M, 2), stockRow(CAP_BLUE, 5)],
    );
    expect(evaluate([shirtLine(1), kitLine(1)], enough)).toBeNull();
  });
});

describe("buildOrderSnapshots", () => {
  it("prices lines from the catalogue and snapshots the bundle composition", () => {
    const catalogue = catalogueOf([kit, cap, shirt], fullStock());
    const { totalPriceCents, items } = buildOrderSnapshots(
      resolve([shirtLine(2), kitLine(1)], catalogue),
    );

    expect(totalPriceCents).toBe(5000 * 2 + 12000);
    expect(items).toEqual([
      {
        productId: "shirt",
        productName: "Camisa",
        dropName: "Drop 1",
        variantName: null,
        sizeLabel: "M",
        unitPriceCents: 5000,
        quantity: 2,
        components: [],
      },
      {
        productId: "kit",
        productName: "Kit Calouro",
        dropName: "Drop 1",
        variantName: null,
        sizeLabel: null,
        unitPriceCents: 12000,
        quantity: 1,
        components: [
          {
            productId: "cap",
            productName: "Boné",
            variantName: "Azul",
            sizeLabel: null,
            quantity: 1,
          },
          {
            productId: "shirt",
            productName: "Camisa",
            variantName: null,
            sizeLabel: "M",
            quantity: 1,
          },
        ],
      },
    ]);
  });
});
