import { prisma } from "@/lib/prisma";
import { buildStockKey } from "@/lib/stock-key";
import { getStorefrontDrop } from "@/services/drop.service";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkProductAvailability,
  getProductById,
  getProductBySlug,
  getProducts,
  getStorefrontProducts,
} from "./product.service";

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/services/drop.service", () => ({ getStorefrontDrop: vi.fn() }));

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    isAvailable: true,
    controlStock: false,
    hasSizes: false,
    hasVariants: false,
    drop: { status: "ACTIVE" },
    sizes: [
      { id: "s1", isAvailable: true },
      { id: "s2", isAvailable: false },
    ],
    variants: [{ id: "v1", isAvailable: true }],
    stockItems: [] as unknown[],
    ...overrides,
  };
}

function mockProduct(product: ReturnType<typeof makeProduct>) {
  vi.mocked(prisma.product.findUnique).mockResolvedValue(product as never);
}

const flagCombos = [false, true].flatMap((controlStock) =>
  [false, true].flatMap((hasSizes) =>
    [false, true].map((hasVariants) => ({
      controlStock,
      hasSizes,
      hasVariants,
    })),
  ),
);

describe("checkProductAvailability", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(flagCombos)(
    "flags %o: available when the selection and stock match",
    async (flags) => {
      const variantId = flags.hasVariants ? "v1" : undefined;
      const sizeId = flags.hasSizes ? "s1" : undefined;

      mockProduct(
        makeProduct({
          ...flags,
          stockItems: flags.controlStock
            ? [
                {
                  stockKey: buildStockKey("p1", variantId, sizeId),
                  onHand: 3,
                  reserved: 0,
                  isAvailable: true,
                },
              ]
            : [],
        }),
      );

      expect(
        await checkProductAvailability("p1", variantId, sizeId, 1),
      ).toEqual({ available: true });
    },
  );

  it("is not found when the product does not exist", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);
    expect(await checkProductAvailability("missing")).toEqual({
      available: false,
      reason: "NOT_FOUND",
    });
  });

  it("rejects a product whose drop is concluded", async () => {
    mockProduct(makeProduct({ drop: { status: "CONCLUDED" } }));
    expect(await checkProductAvailability("p1")).toEqual({
      available: false,
      reason: "DROP_ENDED",
    });
  });

  it("rejects a product whose listing is closed", async () => {
    mockProduct(makeProduct({ isAvailable: false }));
    expect(await checkProductAvailability("p1")).toEqual({
      available: false,
      reason: "PRODUCT_UNAVAILABLE",
    });
  });

  it("requires a size when the product has sizes", async () => {
    mockProduct(makeProduct({ hasSizes: true }));
    expect(await checkProductAvailability("p1")).toEqual({
      available: false,
      reason: "SIZE_UNAVAILABLE",
    });
    expect(await checkProductAvailability("p1", undefined, "s2")).toEqual({
      available: false,
      reason: "SIZE_UNAVAILABLE",
    });
  });

  it("requires a variant when the product has variants", async () => {
    mockProduct(makeProduct({ hasVariants: true }));
    expect(await checkProductAvailability("p1")).toEqual({
      available: false,
      reason: "VARIANT_UNAVAILABLE",
    });
  });

  it("is out of stock when no stock row exists for the combination", async () => {
    mockProduct(makeProduct({ controlStock: true }));
    expect(await checkProductAvailability("p1")).toEqual({
      available: false,
      reason: "OUT_OF_STOCK",
    });
  });

  it("uses onHand minus reserved", async () => {
    mockProduct(
      makeProduct({
        controlStock: true,
        stockItems: [
          {
            stockKey: buildStockKey("p1"),
            onHand: 5,
            reserved: 4,
            isAvailable: true,
          },
        ],
      }),
    );
    expect(
      (await checkProductAvailability("p1", undefined, undefined, 1)).available,
    ).toBe(true);
    expect(
      (await checkProductAvailability("p1", undefined, undefined, 2)).available,
    ).toBe(false);
  });

  it("is unavailable when the stock row is manually withdrawn", async () => {
    mockProduct(
      makeProduct({
        controlStock: true,
        stockItems: [
          {
            stockKey: buildStockKey("p1"),
            onHand: 10,
            reserved: 0,
            isAvailable: false,
          },
        ],
      }),
    );
    expect(await checkProductAvailability("p1")).toEqual({
      available: false,
      reason: "OUT_OF_STOCK",
    });
  });

  it("ignores a stale size id when the product has no sizes", async () => {
    mockProduct(
      makeProduct({
        controlStock: true,
        stockItems: [
          {
            stockKey: buildStockKey("p1"),
            onHand: 2,
            reserved: 0,
            isAvailable: true,
          },
        ],
      }),
    );
    expect(
      (await checkProductAvailability("p1", undefined, "s1", 1)).available,
    ).toBe(true);
  });
});

describe("catalogue reads", () => {
  const databaseError = new Error("connection refused");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStorefrontDrop).mockResolvedValue({ id: "d1" } as never);
  });

  it("getProducts propagates database errors", async () => {
    vi.mocked(prisma.product.findMany).mockRejectedValue(databaseError);
    await expect(getProducts()).rejects.toThrow("connection refused");
  });

  it("getProducts propagates a failure to load the storefront drop", async () => {
    vi.mocked(getStorefrontDrop).mockRejectedValue(databaseError);
    await expect(getProducts()).rejects.toThrow("connection refused");
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("getProductBySlug propagates database errors", async () => {
    vi.mocked(prisma.product.findFirst).mockRejectedValue(databaseError);
    await expect(getProductBySlug("camiseta")).rejects.toThrow(
      "connection refused",
    );
  });

  it("getProductBySlug returns null when no product matches", async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);
    await expect(getProductBySlug("missing")).resolves.toBeNull();
  });

  it("returns no catalogue and no product page when no drop is active", async () => {
    vi.mocked(getStorefrontDrop).mockResolvedValue(null);

    await expect(getProducts()).resolves.toEqual([]);
    await expect(getProductBySlug("camiseta")).resolves.toBeNull();
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it("getStorefrontProducts filters by the storefront drop and includes variants and components", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as never);

    await getStorefrontProducts();

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dropId: "d1" },
        include: expect.objectContaining({
          variants: expect.anything(),
          components: expect.anything(),
        }),
      }),
    );
  });

  it("getStorefrontProducts returns an empty list when no drop is active", async () => {
    vi.mocked(getStorefrontDrop).mockResolvedValue(null);

    await expect(getStorefrontProducts()).resolves.toEqual([]);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("getStorefrontProducts propagates database errors", async () => {
    vi.mocked(prisma.product.findMany).mockRejectedValue(databaseError);
    await expect(getStorefrontProducts()).rejects.toThrow("connection refused");
  });

  it("getStorefrontProducts propagates a failure to load the storefront drop", async () => {
    vi.mocked(getStorefrontDrop).mockRejectedValue(databaseError);
    await expect(getStorefrontProducts()).rejects.toThrow("connection refused");
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("getProductById propagates database errors", async () => {
    vi.mocked(prisma.product.findUnique).mockRejectedValue(databaseError);
    await expect(getProductById("p1")).rejects.toThrow("connection refused");
  });

  it("getProductById returns null when the product does not exist", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);
    await expect(getProductById("missing")).resolves.toBeNull();
  });

  it("getProductById includes the stock rows", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);
    await getProductById("p1");
    expect(prisma.product.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ stockItems: true }),
      }),
    );
  });
});
