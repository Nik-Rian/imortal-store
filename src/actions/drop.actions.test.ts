import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteBlobImages } from "./blob.actions";
import {
  closeAllListings,
  concludeDrop,
  createDrop,
  fetchDropConclusionSummary,
  purgeDrop,
} from "./drop.actions";

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
    product: { findMany: vi.fn(), updateMany: vi.fn() },
    orderItem: { findMany: vi.fn() },
    order: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
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

const makeOrder = (id: string, paymentStatus: string, status: string) => ({
  id,
  customerName: "Ana",
  paymentStatus,
  status,
});

describe("concludeDrop", () => {
  const input = (
    overrides: Partial<{
      confirmName: string;
      acknowledgeUnfulfilled: boolean;
    }> = {},
  ) => ({ confirmName: "2026.2", acknowledgeUnfulfilled: false, ...overrides });

  function buildConcludeTransaction({
    drop = { name: "2026.2", status: "ACTIVE" },
    products = [{ id: "p1" }],
    orderItems = [{ orderId: "o1" }],
    orders = [],
    concludedCount = 1,
  }: {
    drop?: { name: string; status: string } | null;
    products?: { id: string }[];
    orderItems?: { orderId: string }[];
    orders?: ReturnType<typeof makeOrder>[];
    concludedCount?: number;
  } = {}) {
    const tx = {
      drop: {
        findUnique: vi.fn().mockResolvedValue(drop),
        updateMany: vi.fn().mockResolvedValue({ count: concludedCount }),
      },
      product: {
        findMany: vi.fn().mockResolvedValue(products),
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      orderItem: { findMany: vi.fn().mockResolvedValue(orderItems) },
      order: { findMany: vi.fn().mockResolvedValue(orders) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(((
      callback: (client: typeof tx) => unknown,
    ) => callback(tx)) as never);
    return tx;
  }

  function expectNothingConcluded(
    tx: ReturnType<typeof buildConcludeTransaction>,
  ) {
    expect(tx.drop.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  }

  it("refuses while any order is blocking and lists the counts", async () => {
    const tx = buildConcludeTransaction({
      orders: [
        makeOrder("o1", "PENDING", "PENDING"),
        makeOrder("o2", "PENDING", "PENDING"),
        makeOrder("o3", "IN_REVIEW", "PENDING"),
        makeOrder("o4", "PAID", "CANCELED"),
      ],
    });

    const result = await concludeDrop("d1", input());

    expect(result.success).toBe(false);
    const message = result.success === false ? result.error : "";
    expect(message).toMatch(/Pagamento pendente: 2/);
    expect(message).toMatch(/Pagamento em análise: 1/);
    expect(message).toMatch(/Pagamento recebido após cancelamento: 1/);
    expectNothingConcluded(tx);
  });

  it("still refuses blocking orders when the acknowledgement is given", async () => {
    const tx = buildConcludeTransaction({
      orders: [makeOrder("o1", "CHARGEBACK_IN_REVIEW", "COMPLETED")],
    });

    const result = await concludeDrop(
      "d1",
      input({ acknowledgeUnfulfilled: true }),
    );

    expect(result.success).toBe(false);
    expectNothingConcluded(tx);
  });

  it("requires the acknowledgement for paid orders awaiting pickup", async () => {
    const tx = buildConcludeTransaction({
      orders: [makeOrder("o1", "PAID", "PREPARING")],
    });

    expect(await concludeDrop("d1", input())).toMatchObject({
      success: false,
      error: expect.stringMatching(/ciente/),
    });
    expectNothingConcluded(tx);
  });

  it("concludes with the acknowledgement, in one transaction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-20T12:00:00Z"));
    const tx = buildConcludeTransaction({
      orders: [makeOrder("o1", "PARTIALLY_REFUNDED", "READY_FOR_PICKUP")],
    });

    const result = await concludeDrop(
      "d1",
      input({ acknowledgeUnfulfilled: true }),
    );

    expect(result).toEqual({ success: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.drop.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: "ACTIVE" },
      data: {
        status: "CONCLUDED",
        concludedAt: new Date("2026-12-20T12:00:00Z"),
      },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { dropId: "d1", isAvailable: true },
      data: { isAvailable: false },
    });
    expect(prisma.drop.updateMany).not.toHaveBeenCalled();
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/produtos");
  });

  it("concludes without acknowledgement when nothing is unresolved", async () => {
    const tx = buildConcludeTransaction({
      orders: [
        makeOrder("o1", "PAID", "COMPLETED"),
        makeOrder("o2", "FAILED", "CANCELED"),
      ],
    });

    expect(await concludeDrop("d1", input())).toEqual({ success: true });
    expect(tx.drop.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
  });

  it("concludes a drop that has no orders", async () => {
    const tx = buildConcludeTransaction({ orderItems: [] });

    expect(await concludeDrop("d1", input())).toEqual({ success: true });
    expect(tx.order.findMany).not.toHaveBeenCalled();
  });

  it.each(["2026.1", "2026.2 ", " 2026.2", ""])(
    "refuses the typed name %j and writes nothing",
    async (confirmName) => {
      const tx = buildConcludeTransaction();

      expect(await concludeDrop("d1", input({ confirmName }))).toMatchObject({
        success: false,
        error: expect.stringMatching(/nome digitado/),
      });
      expectNothingConcluded(tx);
    },
  );

  it("attributes orders by product link and by the dropName snapshot", async () => {
    const tx = buildConcludeTransaction({
      orderItems: [{ orderId: "o1" }, { orderId: "o1" }],
    });

    await concludeDrop("d1", input());

    expect(tx.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ productId: { in: ["p1"] } }, { dropName: "2026.2" }],
        },
      }),
    );
    expect(tx.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["o1"] } } }),
    );
  });

  it("still finds orders through the snapshot when no product remains", async () => {
    const tx = buildConcludeTransaction({
      products: [],
      orders: [makeOrder("o1", "PENDING", "PENDING")],
    });

    const result = await concludeDrop("d1", input());

    expect(tx.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ dropName: "2026.2" }] } }),
    );
    expect(result.success).toBe(false);
    expectNothingConcluded(tx);
  });

  it("refuses when the drop does not exist", async () => {
    const tx = buildConcludeTransaction({ drop: null });

    expect(await concludeDrop("missing", input())).toMatchObject({
      success: false,
      error: expect.stringMatching(/não encontrado/),
    });
    expectNothingConcluded(tx);
  });

  it("refuses a drop that is not active", async () => {
    const tx = buildConcludeTransaction({
      drop: { name: "2026.2", status: "CONCLUDED" },
    });

    expect(await concludeDrop("d1", input())).toMatchObject({
      success: false,
      error: expect.stringMatching(/não está ativo/),
    });
    expectNothingConcluded(tx);
  });

  it("does not close listings when a concurrent conclusion won the race", async () => {
    const tx = buildConcludeTransaction({ concludedCount: 0 });

    expect(await concludeDrop("d1", input())).toMatchObject({
      success: false,
      error: expect.stringMatching(/não está ativo/),
    });
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a missing drop id", async () => {
    expect(await concludeDrop("", input())).toMatchObject({ success: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated calls before touching the database", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("Não autorizado."));

    await expect(concludeDrop("d1", input())).rejects.toThrow(
      "Não autorizado.",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("logs unexpected database errors and returns a generic message", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("db down"));

    const result = await concludeDrop("d1", input());

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).not.toContain("db down");
    expect(revalidatePath).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe("fetchDropConclusionSummary", () => {
  it("returns counts, per-reason totals and a capped sample", async () => {
    const blockingOrders = Array.from({ length: 7 }, (_, i) =>
      makeOrder(`b${i + 1}`, "PENDING", "PENDING"),
    );
    const orders = [...blockingOrders, makeOrder("a1", "PAID", "PREPARING")];
    vi.mocked(prisma.drop.findUnique).mockResolvedValue({
      name: "2026.2",
      status: "ACTIVE",
    } as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "p1" },
    ] as never);
    vi.mocked(prisma.orderItem.findMany).mockResolvedValue(
      orders.map((o) => ({ orderId: o.id })) as never,
    );
    vi.mocked(prisma.order.findMany).mockResolvedValue(orders as never);

    const result = await fetchDropConclusionSummary("d1");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.summary.blockingCount).toBe(7);
    expect(result.summary.blockingByReason.PAYMENT_PENDING).toBe(7);
    expect(result.summary.blockingSample).toHaveLength(5);
    expect(result.summary.acknowledgeableCount).toBe(1);
    expect(result.summary.acknowledgeableSample).toHaveLength(1);
  });

  it("refuses when the drop does not exist", async () => {
    vi.mocked(prisma.drop.findUnique).mockResolvedValue(null);

    expect(await fetchDropConclusionSummary("missing")).toMatchObject({
      success: false,
      error: expect.stringMatching(/não encontrado/),
    });
  });

  it("rejects unauthenticated calls before touching the database", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("Não autorizado."));

    await expect(fetchDropConclusionSummary("d1")).rejects.toThrow(
      "Não autorizado.",
    );
    expect(prisma.drop.findUnique).not.toHaveBeenCalled();
  });
});
