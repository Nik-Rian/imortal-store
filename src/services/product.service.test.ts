import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildStockKey } from "@/lib/stock-key";
import { checkProductAvailability } from "./product.service";

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("@/lib/prisma", () => ({
  prisma: { product: { findUnique: vi.fn() } },
}));

const day = 86_400_000;

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    isAvailable: true,
    controlStock: false,
    hasSizes: false,
    hasVariants: false,
    drop: {
      startsAt: new Date(Date.now() - day),
      endsAt: new Date(Date.now() + day),
    },
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
        stockItems: [{ stockKey: buildStockKey("p1"), onHand: 5, reserved: 4 }],
      }),
    );
    expect(
      (await checkProductAvailability("p1", undefined, undefined, 1)).available,
    ).toBe(true);
    expect(
      (await checkProductAvailability("p1", undefined, undefined, 2)).available,
    ).toBe(false);
  });

  it("ignores a stale size id when the product has no sizes", async () => {
    mockProduct(
      makeProduct({
        controlStock: true,
        stockItems: [{ stockKey: buildStockKey("p1"), onHand: 2, reserved: 0 }],
      }),
    );
    expect(
      (await checkProductAvailability("p1", undefined, "s1", 1)).available,
    ).toBe(true);
  });
});
