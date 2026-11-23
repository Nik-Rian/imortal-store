import { deleteBlobImages } from "@/actions/blob.actions";
import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProduct,
  deleteProduct,
  setProductAvailability,
  updateProduct,
} from "./product.actions";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    bundleComponent: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    productSize: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      createMany: vi.fn(),
    },
    productVariant: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      createMany: vi.fn(),
    },
    stockItem: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    stockReservation: { count: vi.fn() },
    orderItem: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth-guard", () => ({ requireSession: vi.fn() }));

vi.mock("@/actions/blob.actions", () => ({ deleteBlobImages: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

function bundleForm(overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    name: "Kit",
    slug: "kit",
    description: "d",
    dropId: "d1",
    priceCents: "5000",
    isBundle: "true",
    controlStock: "true",
    hasSizes: "true",
    hasVariants: "true",
    sizes: JSON.stringify([{ size: "P" }]),
    variants: JSON.stringify([{ name: "Preta" }]),
    components: JSON.stringify([{ componentProductId: "c1", quantity: 2 }]),
    ...overrides,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Interactive transactions run their callback against the mocked client.
  vi.mocked(prisma.$transaction).mockImplementation((async (
    callback: (tx: unknown) => unknown,
  ) => callback(prisma)) as never);
});

describe("createProduct (bundles)", () => {
  it("rejects a bundle that contains another bundle", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "c1", isBundle: true, dropId: "d1" },
    ] as never);
    const result = await createProduct(bundleForm());
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/outro kit/),
    });

    expect(prisma.product.create).not.toHaveBeenCalled();
  });
  it("logs an unexpected bundle check failure and returns a generic message", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.product.findMany).mockRejectedValue(new Error("db down"));
    const result = await createProduct(bundleForm());
    expect(result.success).toBe(false);
    expect(result.error).not.toContain("db down");
    expect(prisma.product.create).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("creates a bundle with stock, size and variant flags forced off", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "c1", isBundle: false, dropId: "d1" },
    ] as never);
    vi.mocked(prisma.product.create).mockResolvedValue({} as never);
    await createProduct(bundleForm());
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isBundle: true,
        controlStock: false,
        hasSizes: false,
        hasVariants: false,
        sizes: { create: [] },
        variants: { create: [] },
        components: {
          create: [{ componentProductId: "c1", quantity: 2 }],
        },
      }),
    });
  });
});

describe("updateProduct (bundles)", () => {
  const current = { images: [], variants: [], sizes: [] };
  it("rejects turning a component product into a bundle", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(current as never);
    vi.mocked(prisma.bundleComponent.findMany).mockResolvedValue([
      { bundle: { name: "Kit A", dropId: "d1" } },
    ] as never);
    const result = await updateProduct("c9", bundleForm());
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/já faz parte de um kit/),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("replaces the component set inside the transaction", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(current as never);
    vi.mocked(prisma.bundleComponent.findMany).mockResolvedValue([]);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "c1", isBundle: false, dropId: "d1" },
    ] as never);
    await updateProduct("b1", bundleForm());
    expect(prisma.bundleComponent.deleteMany).toHaveBeenCalledWith({
      where: { bundleId: "b1" },
    });

    expect(prisma.bundleComponent.createMany).toHaveBeenCalledWith({
      data: [{ bundleId: "b1", componentProductId: "c1", quantity: 2 }],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("deleteProduct (bundles)", () => {
  it("refuses to delete a product used as a bundle component", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      images: ["https://blob/c.png"],
      variants: [],
      componentOf: [{ bundle: { name: "Kit A" } }],
    } as never);
    const result = await deleteProduct("c1");
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/Kit A/),
    });

    expect(prisma.product.delete).not.toHaveBeenCalled();
    expect(deleteBlobImages).not.toHaveBeenCalled();
  });
  it("deletes a bundle and its images (join rows cascade in the DB)", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      images: ["https://blob/k.png"],
      variants: [],
      componentOf: [],
    } as never);
    vi.mocked(prisma.product.delete).mockResolvedValue({} as never);
    vi.mocked(prisma.stockReservation.count).mockResolvedValue(0);
    const result = await deleteProduct("b1");
    expect(result).toEqual({ success: true });
    expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: "b1" } });
    expect(deleteBlobImages).toHaveBeenCalledWith(["https://blob/k.png"]);
  });
});

// Payload shaped like the one the admin form posts: priceCents in cents and an
// explicit isAvailable flag. An `undefined` override omits the field.

function productForm(overrides: Record<string, string | undefined> = {}) {
  const fields: Record<string, string | undefined> = {
    name: "Camiseta",
    slug: "camiseta",
    description: "d",
    dropId: "d1",
    priceCents: "4990",
    isAvailable: "true",
    isBundle: "false",
    controlStock: "false",
    hasSizes: "false",
    hasVariants: "false",
    sizes: "[]",
    variants: "[]",
    components: "[]",
    ...overrides,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) fd.set(key, value);
  }
  return fd;
}

function updatedProductData() {
  const call = vi.mocked(prisma.product.update).mock.calls[0] as unknown as [
    { data: { priceCents?: number; isAvailable?: boolean; slug?: string } },
  ];
  return call[0].data;
}

describe("createProduct (price and availability)", () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bundleComponent.findMany).mockResolvedValue([]);
    vi.mocked(prisma.product.create).mockResolvedValue({} as never);
  });
  it("rejects a payload that only carries the legacy price field", async () => {
    const result = await createProduct(
      productForm({ priceCents: undefined, price: "49.90" }),
    );
    expect(result.success).toBe(false);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it("returns a slug conflict message for a unique-constraint error", async () => {
    vi.mocked(prisma.product.create).mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: ["slug"] },
      }),
    );
    const result = await createProduct(productForm());
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/Já existe um produto/),
    });
  });
  it("returns a duplicate-entry message for a non-slug unique violation", async () => {
    vi.mocked(prisma.product.create).mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: ["productId", "name"] },
      }),
    );
    const result = await createProduct(productForm());
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/item duplicado/),
    });
  });
  it("logs unexpected errors and returns a generic message", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.product.create).mockRejectedValue(new Error("db down"));
    const result = await createProduct(productForm());
    expect(result.success).toBe(false);
    expect(result.error).not.toContain("db down");
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("persists priceCents exactly as posted", async () => {
    await createProduct(productForm({ priceCents: "4990" }));
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ priceCents: 4990 }),
    });
  });
  it("persists isAvailable=false when the form posts false", async () => {
    await createProduct(productForm({ isAvailable: "false" }));
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isAvailable: false }),
    });
  });
  it("persists isAvailable=true when the form posts true", async () => {
    await createProduct(productForm({ isAvailable: "true" }));
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isAvailable: true }),
    });
  });
  it("defaults to available when the field is absent", async () => {
    await createProduct(productForm({ isAvailable: undefined }));
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isAvailable: true }),
    });
  });
});

describe("updateProduct (price, availability and page revalidation)", () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      slug: "camiseta",
      images: [],
      variants: [],
      sizes: [],
    } as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bundleComponent.findMany).mockResolvedValue([]);
  });
  it("rejects a payload that only carries the legacy price field", async () => {
    const result = await updateProduct(
      "p1",
      productForm({ priceCents: undefined, price: "49.90" }),
    );
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns a readable error when the product does not exist", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);
    const result = await updateProduct("missing", productForm());
    expect(result).toEqual({
      success: false,
      error: "Produto não encontrado.",
    });
  });
  it("returns a slug conflict message for a unique-constraint error", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: ["slug"] },
      }),
    );
    const result = await updateProduct("p1", productForm());
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/Já existe um produto/),
    });
  });
  it("persists priceCents exactly as posted", async () => {
    await updateProduct("p1", productForm({ priceCents: "4990" }));
    expect(updatedProductData().priceCents).toBe(4990);
  });

  it("closes the listing when the form posts false", async () => {
    await updateProduct("p1", productForm({ isAvailable: "false" }));
    expect(updatedProductData().isAvailable).toBe(false);
  });

  it("keeps the stored availability when the field is absent", async () => {
    await updateProduct("p1", productForm({ isAvailable: undefined }));
    expect(updatedProductData().isAvailable).toBeUndefined();
  });

  it("revalidates the product page for the saved slug", async () => {
    await updateProduct("p1", productForm({ slug: "camiseta" }));
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/produto/camiseta");
  });

  it("also revalidates the previous slug when it changed", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      slug: "camiseta-antiga",
      images: [],
      variants: [],
      sizes: [],
    } as never);
    await updateProduct("p1", productForm({ slug: "camiseta" }));
    expect(revalidatePath).toHaveBeenCalledWith("/produto/camiseta");
    expect(revalidatePath).toHaveBeenCalledWith("/produto/camiseta-antiga");
  });
});

describe("updateProduct (slug)", () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      slug: "camiseta-antiga",
      images: [],
      variants: [],
      sizes: [],
    } as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bundleComponent.findMany).mockResolvedValue([]);
  });

  it("keeps the stored slug when the slug field is absent", async () => {
    await updateProduct("p1", productForm({ slug: undefined }));
    expect(updatedProductData().slug).toBe("camiseta-antiga");
    expect(revalidatePath).toHaveBeenCalledWith("/produto/camiseta-antiga");
  });

  it("keeps the stored slug when the slug field is blank", async () => {
    await updateProduct("p1", productForm({ slug: "" }));
    expect(updatedProductData().slug).toBe("camiseta-antiga");
  });

  it("stores the posted slug when it was changed deliberately", async () => {
    await updateProduct("p1", productForm({ slug: "camiseta-nova" }));
    expect(updatedProductData().slug).toBe("camiseta-nova");
    expect(revalidatePath).toHaveBeenCalledWith("/produto/camiseta-nova");
    expect(revalidatePath).toHaveBeenCalledWith("/produto/camiseta-antiga");
  });
});

describe("setProductAvailability", () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      slug: "camiseta",
    } as never);
    vi.mocked(prisma.product.update).mockResolvedValue({} as never);
  });

  it.each([true, false])(
    "writes only isAvailable=%s and revalidates the storefront and admin list",
    async (value) => {
      const result = await setProductAvailability("p1", value);

      expect(result).toEqual({ success: true });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { isAvailable: value },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith("/");
      expect(revalidatePath).toHaveBeenCalledWith("/produto/camiseta");
      expect(revalidatePath).toHaveBeenCalledWith("/admin/produtos");
    },
  );

  it("rejects unauthenticated calls before touching the database", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("Não autorizado."));

    await expect(setProductAvailability("p1", false)).rejects.toThrow(
      "Não autorizado.",
    );
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("returns a readable error when the product does not exist", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

    const result = await setProductAvailability("missing", false);

    expect(result).toEqual({
      success: false,
      error: "Produto não encontrado.",
    });
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean availability value", async () => {
    const result = await setProductAvailability("p1", "false" as never);

    expect(result.success).toBe(false);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("logs unexpected database errors and returns a generic message", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.product.update).mockRejectedValue(new Error("db down"));

    const result = await setProductAvailability("p1", false);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).not.toContain("db down");
    expect(revalidatePath).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

function trackedForm(overrides: Record<string, string | undefined> = {}) {
  return productForm({
    controlStock: "true",
    hasSizes: "true",
    hasVariants: "true",
    sizes: JSON.stringify([{ id: "s1", size: "M" }]),
    variants: JSON.stringify([{ id: "v1", name: "Preta" }]),
    stock: JSON.stringify([
      { variantName: "Preta", sizeLabel: "M", onHand: 5, isAvailable: true },
    ]),
    ...overrides,
  });
}

function mockPersistedOptions() {
  vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
    { id: "v1", name: "Preta" },
  ] as never);
  vi.mocked(prisma.productSize.findMany).mockResolvedValue([
    { id: "s1", size: "M" },
  ] as never);
}

describe("createProduct (stock)", () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bundleComponent.findMany).mockResolvedValue([]);
    vi.mocked(prisma.product.create).mockResolvedValue({ id: "p9" } as never);
    vi.mocked(prisma.stockItem.findMany).mockResolvedValue([]);
    mockPersistedOptions();
  });

  it("creates stock rows keyed by the generated option ids", async () => {
    await createProduct(
      trackedForm({
        sizes: JSON.stringify([{ size: "M" }]),
        variants: JSON.stringify([{ name: "Preta" }]),
      }),
    );
    expect(prisma.stockItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          productId: "p9",
          variantId: "v1",
          sizeId: "s1",
          stockKey: "p9#v1#s1",
          onHand: 5,
          isAvailable: true,
        },
      ],
    });
  });

  it("does not touch stock when tracking is off", async () => {
    await createProduct(trackedForm({ controlStock: "false" }));
    expect(prisma.stockItem.findMany).not.toHaveBeenCalled();
    expect(prisma.stockItem.createMany).not.toHaveBeenCalled();
  });

  it("rejects a negative quantity", async () => {
    const result = await createProduct(
      trackedForm({
        stock: JSON.stringify([
          {
            variantName: "Preta",
            sizeLabel: "M",
            onHand: -1,
            isAvailable: true,
          },
        ]),
      }),
    );
    expect(result.success).toBe(false);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
});

describe("updateProduct (stock)", () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      slug: "camiseta",
      images: [],
      variants: [{ id: "v1", name: "Preta", image: null }],
      sizes: [{ id: "s1", size: "M" }],
    } as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bundleComponent.findMany).mockResolvedValue([]);
    vi.mocked(prisma.stockReservation.count).mockResolvedValue(0);
    vi.mocked(prisma.orderItem.count).mockResolvedValue(0);
    vi.mocked(prisma.stockItem.findMany).mockResolvedValue([
      {
        id: "si1",
        stockKey: "p1#v1#s1",
        onHand: 2,
        reserved: 1,
        isAvailable: true,
      },
    ] as never);
    mockPersistedOptions();
  });

  it("updates the existing row with the reserved guard in the WHERE clause", async () => {
    vi.mocked(prisma.stockItem.updateMany).mockResolvedValue({ count: 1 });
    await updateProduct("p1", trackedForm());
    expect(prisma.stockItem.updateMany).toHaveBeenCalledWith({
      where: { id: "si1", reserved: { lte: 5 } },
      data: { onHand: 5, isAvailable: true },
    });
    expect(prisma.stockItem.createMany).not.toHaveBeenCalled();
  });

  it("creates a row for a combination that has none yet", async () => {
    vi.mocked(prisma.stockItem.findMany).mockResolvedValue([]);
    await updateProduct("p1", trackedForm());
    expect(prisma.stockItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          productId: "p1",
          variantId: "v1",
          sizeId: "s1",
          stockKey: "p1#v1#s1",
          onHand: 5,
          isAvailable: true,
        },
      ],
    });
  });

  it("persists a manually withdrawn combination", async () => {
    vi.mocked(prisma.stockItem.updateMany).mockResolvedValue({ count: 1 });
    await updateProduct(
      "p1",
      trackedForm({
        stock: JSON.stringify([
          {
            variantName: "Preta",
            sizeLabel: "M",
            onHand: 2,
            isAvailable: false,
          },
        ]),
      }),
    );
    expect(prisma.stockItem.updateMany).toHaveBeenCalledWith({
      where: { id: "si1", reserved: { lte: 2 } },
      data: { onHand: 2, isAvailable: false },
    });
  });

  it("rejects a quantity below the reserved amount", async () => {
    vi.mocked(prisma.stockItem.findMany).mockResolvedValue([
      {
        id: "si1",
        stockKey: "p1#v1#s1",
        onHand: 6,
        reserved: 3,
        isAvailable: true,
      },
    ] as never);
    vi.mocked(prisma.stockItem.updateMany).mockResolvedValue({ count: 0 });
    const result = await updateProduct("p1", trackedForm());
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/reservada \(3\)/),
    });
  });

  it("refuses to remove a size that appears in order history", async () => {
    vi.mocked(prisma.orderItem.count).mockResolvedValue(1);
    const result = await updateProduct(
      "p1",
      trackedForm({ hasSizes: "false", sizes: "[]", stock: "[]" }),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/tamanhos.*indisponíveis/),
    });
    expect(prisma.productSize.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses to remove a variant referenced by a reservation", async () => {
    vi.mocked(prisma.stockReservation.count).mockResolvedValue(1);
    const result = await updateProduct(
      "p1",
      trackedForm({ hasVariants: "false", variants: "[]", stock: "[]" }),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/variantes.*indisponíveis/),
    });
    expect(prisma.productVariant.deleteMany).not.toHaveBeenCalled();
  });

  it("leaves stock rows untouched when tracking is off", async () => {
    await updateProduct(
      "p1",
      trackedForm({ controlStock: "false", stock: "[]" }),
    );
    expect(prisma.stockItem.findMany).not.toHaveBeenCalled();
    expect(prisma.stockItem.updateMany).not.toHaveBeenCalled();
    expect(prisma.stockItem.createMany).not.toHaveBeenCalled();
  });
});

describe("deleteProduct (stock reservations)", () => {
  it("refuses to delete a product with stock reservations", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      images: [],
      variants: [],
      componentOf: [],
    } as never);
    vi.mocked(prisma.stockReservation.count).mockResolvedValue(2);
    const result = await deleteProduct("p1");
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/reservas/),
    });
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });
});
