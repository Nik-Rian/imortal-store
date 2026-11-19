import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { deleteBlobImages } from "@/actions/blob.actions";
import { revalidatePath } from "next/cache";
import { createProduct, deleteProduct, updateProduct } from "./product.actions";

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
});

describe("createProduct (bundles)", () => {
  it("rejects a bundle that contains another bundle", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "c1", isBundle: true, dropId: "d1" },
    ] as never);
    await expect(createProduct(bundleForm())).rejects.toThrow(/outro kit/);
    expect(prisma.product.create).not.toHaveBeenCalled();
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
    await expect(updateProduct("c9", bundleForm())).rejects.toThrow(
      /já faz parte de um kit/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("replaces the component set inside the transaction", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(current as never);
    vi.mocked(prisma.bundleComponent.findMany).mockResolvedValue([]);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "c1", isBundle: false, dropId: "d1" },
    ] as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

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
    await expect(deleteProduct("c1")).rejects.toThrow(/Kit A/);
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

    await deleteProduct("b1");

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
  const call = vi.mocked(prisma.product.update).mock
    .calls[0] as unknown as [
    { data: { priceCents?: number; isAvailable?: boolean } },
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
    await expect(
      createProduct(productForm({ priceCents: undefined, price: "49.90" })),
    ).rejects.toThrow();
    expect(prisma.product.create).not.toHaveBeenCalled();
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
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
  });

  it("rejects a payload that only carries the legacy price field", async () => {
    await expect(
      updateProduct(
        "p1",
        productForm({ priceCents: undefined, price: "49.90" }),
      ),
    ).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
