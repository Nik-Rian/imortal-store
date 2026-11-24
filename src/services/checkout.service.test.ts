import { prisma } from "@/lib/prisma";
import { buildStockKey } from "@/lib/stock-key";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCheckoutCatalogue } from "./checkout.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany: vi.fn() },
    stockItem: { findMany: vi.fn() },
  },
}));

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    name: "Camisa",
    priceCents: 5000,
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

const cap = row({
  id: "prod-cap",
  name: "Boné",
  controlStock: true,
  hasVariants: true,
  variants: [{ id: "var-blue", name: "Azul", isAvailable: true }],
});
const kit = row({
  id: "prod-kit",
  name: "Kit",
  isBundle: true,
  components: [
    { componentProductId: "prod-cap", quantity: 1, componentProduct: cap },
  ],
});

describe("loadCheckoutCatalogue", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.stockItem.findMany).mockResolvedValue([] as never);
  });

  it.each([1, 20])(
    "queries the products once and the stock once with %i lines",
    async (count) => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([
        row({ controlStock: true }),
      ] as never);
      const lines = Array.from({ length: count }, (_, index) =>
        index % 2 === 0
          ? { productId: "prod-1" }
          : { variantId: `var-${index}` },
      );

      await loadCheckoutCatalogue(lines);

      expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.stockItem.findMany).toHaveBeenCalledTimes(1);
    },
  );

  it("skips the stock query when no product controls stock", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([row()] as never);

    await loadCheckoutCatalogue([{ productId: "prod-1" }]);

    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.stockItem.findMany).not.toHaveBeenCalled();
  });

  it("requests a line with a variant through the variant only and deduplicates ids", async () => {
    await loadCheckoutCatalogue([
      { productId: "prod-1", variantId: "var-1" },
      { productId: "prod-2" },
      { productId: "prod-2" },
    ]);

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { id: { in: ["prod-2"] } },
            { variants: { some: { id: { in: ["var-1"] } } } },
          ],
        },
      }),
    );
  });

  it("adds the component products of a bundle to the catalogue", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([kit] as never);

    const catalogue = await loadCheckoutCatalogue([{ productId: "prod-kit" }]);

    expect([...catalogue.products.keys()]).toEqual(["prod-kit", "prod-cap"]);
    expect(catalogue.products.get("prod-kit")?.components).toEqual([
      { componentProductId: "prod-cap", quantity: 1 },
    ]);
    expect(catalogue.products.get("prod-cap")?.components).toEqual([]);
    expect(prisma.stockItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: { in: ["prod-cap"] } } }),
    );
  });

  it("does not duplicate a component product that is also requested as a line", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([kit, cap] as never);

    const catalogue = await loadCheckoutCatalogue([
      { productId: "prod-kit" },
      { productId: "prod-cap" },
    ]);

    expect([...catalogue.products.keys()]).toEqual(["prod-kit", "prod-cap"]);
  });

  it("indexes the stock rows by stock key", async () => {
    const key = buildStockKey("prod-cap", "var-blue", null);
    const stockRow = {
      stockKey: key,
      onHand: 4,
      reserved: 1,
      isAvailable: true,
    };
    vi.mocked(prisma.product.findMany).mockResolvedValue([cap] as never);
    vi.mocked(prisma.stockItem.findMany).mockResolvedValue([stockRow] as never);

    const catalogue = await loadCheckoutCatalogue([{ productId: "prod-cap" }]);

    expect(catalogue.stock.get(key)).toEqual(stockRow);
  });

  it("propagates database errors", async () => {
    vi.mocked(prisma.product.findMany).mockRejectedValue(
      new Error("connection refused"),
    );
    await expect(
      loadCheckoutCatalogue([{ productId: "prod-1" }]),
    ).rejects.toThrow("connection refused");
  });
});
