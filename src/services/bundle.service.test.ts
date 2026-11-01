import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertBundleIntegrity } from "./bundle.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany: vi.fn() },
    bundleComponent: { findMany: vi.fn() },
  },
}));

const components = [
  { componentProductId: "c1", quantity: 1 },
  { componentProductId: "c2", quantity: 2 },
];

function mockFound(rows: { id: string; isBundle: boolean; dropId: string }[]) {
  vi.mocked(prisma.product.findMany).mockResolvedValue(rows as never);
}

const ordinary = (id: string, dropId = "d1") => ({
  id,
  isBundle: false,
  dropId,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.bundleComponent.findMany).mockResolvedValue([]);
});

describe("assertBundleIntegrity", () => {
  it("accepts same-drop ordinary components", async () => {
    mockFound([ordinary("c1"), ordinary("c2")]);
    await expect(
      assertBundleIntegrity({ dropId: "d1", isBundle: true, components }),
    ).resolves.toBeUndefined();
  });

  it("rejects a component that does not exist", async () => {
    mockFound([ordinary("c1")]);
    await expect(
      assertBundleIntegrity({ dropId: "d1", isBundle: true, components }),
    ).rejects.toThrow(/não existe/);
  });

  it("rejects a bundle inside a bundle", async () => {
    mockFound([ordinary("c1"), { id: "c2", isBundle: true, dropId: "d1" }]);
    await expect(
      assertBundleIntegrity({ dropId: "d1", isBundle: true, components }),
    ).rejects.toThrow(/outro kit/);
  });

  it("rejects a component from another drop", async () => {
    mockFound([ordinary("c1"), ordinary("c2", "d2")]);
    await expect(
      assertBundleIntegrity({ dropId: "d1", isBundle: true, components }),
    ).rejects.toThrow(/mesmo drop/);
  });

  it("rejects a bundle that contains itself", async () => {
    await expect(
      assertBundleIntegrity({
        productId: "c1",
        dropId: "d1",
        isBundle: true,
        components,
      }),
    ).rejects.toThrow(/a si mesmo/);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("rejects turning a component into a bundle", async () => {
    vi.mocked(prisma.bundleComponent.findMany).mockResolvedValue([
      { bundle: { name: "Kit A", dropId: "d1" } },
    ] as never);
    await expect(
      assertBundleIntegrity({
        productId: "c1",
        dropId: "d1",
        isBundle: true,
        components: [{ componentProductId: "x", quantity: 1 }],
      }),
    ).rejects.toThrow(/já faz parte de um kit/);
  });

  it("rejects moving a component to another drop", async () => {
    vi.mocked(prisma.bundleComponent.findMany).mockResolvedValue([
      { bundle: { name: "Kit A", dropId: "d1" } },
    ] as never);
    await expect(
      assertBundleIntegrity({
        productId: "c1",
        dropId: "d2",
        isBundle: false,
        components: [],
      }),
    ).rejects.toThrow(/outro drop/);
  });

  it("skips component lookups for an ordinary product", async () => {
    await assertBundleIntegrity({
      dropId: "d1",
      isBundle: false,
      components: [],
    });
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.bundleComponent.findMany).not.toHaveBeenCalled();
  });
});
