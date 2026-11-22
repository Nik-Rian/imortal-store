import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteBlobImages } from "./blob.actions";
import { closeAllListings, createDrop, purgeDrop } from "./drop.actions";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    drop: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    product: { updateMany: vi.fn() },
    order: { update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    stockItem: { update: vi.fn(), updateMany: vi.fn() },
    stockReservation: { update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth-guard", () => ({ requireSession: vi.fn() }));

vi.mock("./blob.actions", () => ({ deleteBlobImages: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("createDrop", () => {
  it("refuses while an active drop exists", async () => {
    vi.mocked(prisma.drop.findFirst).mockResolvedValueOnce({
      name: "2026.2",
    } as never);

    const result = await createDrop();

    expect(result).toMatchObject({ success: false });
    expect(result.success === false && result.error).toMatch(
      /ainda está ativo/,
    );
    expect(prisma.drop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "ACTIVE" } }),
    );
    expect(prisma.drop.create).not.toHaveBeenCalled();
  });

  it("returns a readable error when the semester name already exists", async () => {
    vi.mocked(prisma.drop.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "old" } as never);

    const result = await createDrop();

    expect(result.success === false && result.error).toMatch(/Já existe/);
    expect(prisma.drop.create).not.toHaveBeenCalled();
  });

  it("maps a unique-constraint race to the same readable error", async () => {
    vi.mocked(prisma.drop.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.drop.create).mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    const result = await createDrop();

    expect(result.success === false && result.error).toMatch(/Já existe/);
  });

  it("rethrows unexpected database errors", async () => {
    vi.mocked(prisma.drop.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.drop.create).mockRejectedValue(new Error("db down"));

    await expect(createDrop()).rejects.toThrow("db down");
  });

  it("creates the semester drop when nothing blocks it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    vi.mocked(prisma.drop.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.drop.create).mockResolvedValue({} as never);

    const result = await createDrop();

    expect(result).toEqual({ success: true });
    expect(prisma.drop.create).toHaveBeenCalledWith({
      data: { name: "2026.2", slug: "2026-2" },
    });
  });

  it("does nothing when the caller is not an admin", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("Não autorizado."));

    await expect(createDrop()).rejects.toThrow("Não autorizado.");
    expect(prisma.drop.findFirst).not.toHaveBeenCalled();
  });
});

describe("purgeDrop", () => {
  const closedDrop = { name: "2026.1", status: "CONCLUDED" };
  const openDrop = { name: "2026.2", status: "ACTIVE" };

  type PurgeOrder = {
    paymentStatus: string;
    paymentReviewReason: string | null;
  };

  function buildTransaction({
    drop = closedDrop,
    orders = [],
    orderItems = [{ orderId: "o1" }],
    products = [
      {
        id: "p1",
        images: ["https://blob/x.png"],
        variants: [{ image: "https://blob/v.png" }, { image: null }],
      },
    ],
  }: {
    drop?: typeof closedDrop | null;
    orders?: PurgeOrder[];
    orderItems?: { orderId: string }[];
    products?: {
      id: string;
      images: string[];
      variants: { image: string | null }[];
    }[];
  } = {}) {
    const tx = {
      drop: {
        findUnique: vi.fn().mockResolvedValue(drop),
        delete: vi.fn(),
      },
      product: {
        findMany: vi.fn().mockResolvedValue(products),
        deleteMany: vi.fn(),
      },
      orderItem: {
        findMany: vi.fn().mockResolvedValue(orderItems),
        deleteMany: vi.fn(),
      },
      order: {
        findMany: vi.fn().mockResolvedValue(orders),
        deleteMany: vi.fn(),
      },
      productVariant: { deleteMany: vi.fn() },
      bundleComponent: { deleteMany: vi.fn() },
      stockReservation: { deleteMany: vi.fn() },
      stockItem: { deleteMany: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation(((
      callback: (client: typeof tx) => unknown,
    ) => callback(tx)) as never);
    return tx;
  }

  function expectNothingDeleted(tx: ReturnType<typeof buildTransaction>) {
    expect(tx.drop.delete).not.toHaveBeenCalled();
    for (const model of [
      tx.product,
      tx.orderItem,
      tx.order,
      tx.productVariant,
      tx.bundleComponent,
      tx.stockReservation,
      tx.stockItem,
    ]) {
      expect(model.deleteMany).not.toHaveBeenCalled();
    }
    expect(deleteBlobImages).not.toHaveBeenCalled();
  }

  beforeEach(() => {
    vi.stubEnv("ALLOW_DESTRUCTIVE_PURGE", "true");
  });

  it.each([undefined, "false", "1"])(
    "refuses and deletes nothing when the purge flag is %s",
    async (flag) => {
      vi.stubEnv("ALLOW_DESTRUCTIVE_PURGE", flag);

      const result = await purgeDrop("expired-drop");
      expect(result).toMatchObject({
        success: false,
        error: expect.stringMatching(/desabilitada/),
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(deleteBlobImages).not.toHaveBeenCalled();
    },
  );

  it("refuses when the drop does not exist", async () => {
    const tx = buildTransaction({ drop: null });

    expect(await purgeDrop("missing-drop")).toMatchObject({
      success: false,
      error: expect.stringMatching(/não encontrado/),
    });
    expectNothingDeleted(tx);
  });

  it("refuses while the drop is active", async () => {
    const tx = buildTransaction({ drop: openDrop });

    expect(await purgeDrop("open-drop")).toMatchObject({
      success: false,
      error: expect.stringMatching(/não foi concluído/),
    });
    expectNothingDeleted(tx);
  });

  it.each([
    "PENDING",
    "IN_REVIEW",
    "PAID",
    "PARTIALLY_REFUNDED",
    "REFUNDED",
    "CHARGEBACK_IN_REVIEW",
    "CHARGEBACK_LOST",
    "CHARGEBACK_WON",
  ])("refuses when any order is %s", async (paymentStatus) => {
    const tx = buildTransaction({
      orders: [
        { paymentStatus: "CANCELED", paymentReviewReason: null },
        { paymentStatus, paymentReviewReason: null },
      ],
    });

    expect(await purgeDrop("expired-drop")).toMatchObject({
      success: false,
      error: expect.stringMatching(/pedidos/),
    });
    expectNothingDeleted(tx);
  });

  it("refuses when a purgeable order carries a payment review reason", async () => {
    const tx = buildTransaction({
      orders: [
        { paymentStatus: "FAILED", paymentReviewReason: "LATE_PAYMENT" },
      ],
    });

    expect(await purgeDrop("expired-drop")).toMatchObject({
      success: false,
      error: expect.stringMatching(/pedidos/),
    });
    expectNothingDeleted(tx);
  });

  it("counts orders reached only through the dropName snapshot", async () => {
    const tx = buildTransaction({
      products: [],
      orders: [{ paymentStatus: "PAID", paymentReviewReason: null }],
    });

    expect(await purgeDrop("expired-drop")).toMatchObject({
      success: false,
      error: expect.stringMatching(/pedidos/),
    });

    expect(tx.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ dropName: "2026.1" }] } }),
    );
    expectNothingDeleted(tx);
  });

  it.each(["FAILED", "EXPIRED", "CANCELED"])(
    "purges a closed drop whose orders are %s, including stock rows and images",
    async (paymentStatus) => {
      const tx = buildTransaction({
        orders: [{ paymentStatus, paymentReviewReason: null }],
      });

      const result = await purgeDrop("expired-drop");
      expect(result).toEqual({ success: true });

      expect(tx.stockReservation.deleteMany).toHaveBeenCalledWith({
        where: { orderId: { in: ["o1"] } },
      });
      expect(tx.stockItem.deleteMany).toHaveBeenCalledWith({
        where: { productId: { in: ["p1"] } },
      });
      expect(tx.order.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["o1"] } },
      });
      expect(tx.bundleComponent.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { bundleId: { in: ["p1"] } },
            { componentProductId: { in: ["p1"] } },
          ],
        },
      });
      expect(tx.drop.delete).toHaveBeenCalledWith({
        where: { id: "expired-drop" },
      });

      const order = (mock: { mock: { invocationCallOrder: number[] } }) =>
        mock.mock.invocationCallOrder[0];
      expect(order(tx.stockReservation.deleteMany)).toBeLessThan(
        order(tx.order.deleteMany),
      );
      expect(order(tx.stockReservation.deleteMany)).toBeLessThan(
        order(tx.stockItem.deleteMany),
      );
      expect(order(tx.stockItem.deleteMany)).toBeLessThan(
        order(tx.product.deleteMany),
      );
      expect(order(tx.bundleComponent.deleteMany)).toBeLessThan(
        order(tx.product.deleteMany),
      );

      expect(deleteBlobImages).toHaveBeenCalledWith([
        "https://blob/x.png",
        "https://blob/v.png",
      ]);
    },
  );

  it("purges a closed drop that has no orders", async () => {
    const tx = buildTransaction({ orderItems: [], orders: [] });

    const result = await purgeDrop("expired-drop");
    expect(result).toEqual({ success: true });

    expect(tx.stockReservation.deleteMany).not.toHaveBeenCalled();
    expect(tx.order.deleteMany).not.toHaveBeenCalled();
    expect(tx.stockItem.deleteMany).toHaveBeenCalled();
    expect(tx.drop.delete).toHaveBeenCalledWith({
      where: { id: "expired-drop" },
    });
  });

  it("logs unexpected database errors and returns a generic message", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("db down"));

    const result = await purgeDrop("expired-drop");

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).not.toContain("db down");
    expect(deleteBlobImages).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe("closeAllListings", () => {
  function expectNoWritesOutsideProducts() {
    for (const write of [
      prisma.drop.create,
      prisma.drop.update,
      prisma.drop.updateMany,
      prisma.drop.delete,
      prisma.order.update,
      prisma.order.updateMany,
      prisma.order.deleteMany,
      prisma.stockItem.update,
      prisma.stockItem.updateMany,
      prisma.stockReservation.update,
      prisma.stockReservation.updateMany,
      prisma.$transaction,
    ]) {
      expect(write).not.toHaveBeenCalled();
    }
  }

  beforeEach(() => {
    vi.mocked(prisma.drop.findUnique).mockResolvedValue({
      name: "2026.2",
      status: "ACTIVE",
    } as never);
    vi.mocked(prisma.product.updateMany).mockResolvedValue({
      count: 3,
    } as never);
  });

  it("closes only the open listings of the active drop in one statement", async () => {
    const result = await closeAllListings("d1");

    expect(result).toEqual({ success: true, count: 3 });
    expect(prisma.product.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { dropId: "d1", isAvailable: true, drop: { status: "ACTIVE" } },
      data: { isAvailable: false },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/produtos");
  });

  it("performs no order, payment, stock or drop write", async () => {
    await closeAllListings("d1");

    expectNoWritesOutsideProducts();
  });

  it("reports zero when no listing was open", async () => {
    vi.mocked(prisma.product.updateMany).mockResolvedValue({
      count: 0,
    } as never);

    expect(await closeAllListings("d1")).toEqual({ success: true, count: 0 });
  });

  it("refuses when the drop does not exist", async () => {
    vi.mocked(prisma.drop.findUnique).mockResolvedValue(null);

    expect(await closeAllListings("missing")).toMatchObject({
      success: false,
      error: expect.stringMatching(/não encontrado/),
    });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a drop that is not the active one", async () => {
    vi.mocked(prisma.drop.findUnique).mockResolvedValue({
      name: "2026.1",
      status: "CONCLUDED",
    } as never);

    expect(await closeAllListings("old")).toMatchObject({
      success: false,
      error: expect.stringMatching(/não está ativo/),
    });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
    expectNoWritesOutsideProducts();
  });

  it("refuses a missing drop id", async () => {
    expect(await closeAllListings("")).toMatchObject({ success: false });
    expect(prisma.drop.findUnique).not.toHaveBeenCalled();
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated calls before touching the database", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("Não autorizado."));

    await expect(closeAllListings("d1")).rejects.toThrow("Não autorizado.");
    expect(prisma.drop.findUnique).not.toHaveBeenCalled();
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("logs unexpected database errors and returns a generic message", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.product.updateMany).mockRejectedValue(
      new Error("db down"),
    );

    const result = await closeAllListings("d1");

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).not.toContain("db down");
    expect(revalidatePath).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
