import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { deleteBlobImages } from "@/actions/blob.actions";
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
