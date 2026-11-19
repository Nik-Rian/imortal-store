import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { deleteBlobImages } from "./blob.actions";
import { closeDropSales, createDrop, purgeDrop } from "./drop.actions";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    drop: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
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
  it("refuses while an open drop exists", async () => {
    vi.mocked(prisma.drop.findFirst).mockResolvedValueOnce({
      name: "2026.2",
    } as never);

    const result = await createDrop();

    expect(result).toMatchObject({ success: false });
    expect(result.success === false && result.error).toMatch(
      /ainda está aberto/,
    );
    expect(prisma.drop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { endsAt: { gte: expect.any(Date) } } }),
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
      data: expect.objectContaining({ name: "2026.2", slug: "2026-2" }),
    });
  });

  it("does nothing when the caller is not an admin", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("Não autorizado."));

    await expect(createDrop()).rejects.toThrow("Não autorizado.");
    expect(prisma.drop.findFirst).not.toHaveBeenCalled();
  });
});

describe("closeDropSales", () => {
  it("only updates a drop that is still open", async () => {
    vi.mocked(prisma.drop.updateMany).mockResolvedValue({ count: 1 });

    await closeDropSales("drop-1");

    expect(prisma.drop.updateMany).toHaveBeenCalledWith({
      where: { id: "drop-1", endsAt: { gte: expect.any(Date) } },
      data: { endsAt: expect.any(Date) },
    });
  });
});

describe("purgeDrop", () => {
  const closedDrop = {
    name: "2026.1",
    endsAt: new Date("2026-06-30T00:00:00Z"),
  };
  const openDrop = {
    name: "2026.2",
    endsAt: new Date("2026-12-31T00:00:00Z"),
  };

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
  });

  it.each([undefined, "false", "1"])(
    "refuses and deletes nothing when the purge flag is %s",
    async (flag) => {
      vi.stubEnv("ALLOW_DESTRUCTIVE_PURGE", flag);

      await expect(purgeDrop("expired-drop")).rejects.toThrow(/desabilitada/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(deleteBlobImages).not.toHaveBeenCalled();
    },
  );

  it("refuses when the drop does not exist", async () => {
    const tx = buildTransaction({ drop: null });

    await expect(purgeDrop("missing-drop")).rejects.toThrow(/não encontrado/);
    expectNothingDeleted(tx);
  });

  it("refuses while the sales window is open", async () => {
    const tx = buildTransaction({ drop: openDrop });

    await expect(purgeDrop("open-drop")).rejects.toThrow(/ainda está aberto/);
    expectNothingDeleted(tx);
  });

  it("refuses when the sales window ends exactly now", async () => {
    const tx = buildTransaction({
      drop: { name: "2026.2", endsAt: new Date("2026-11-19T12:00:00Z") },
    });

    await expect(purgeDrop("edge-drop")).rejects.toThrow(/ainda está aberto/);
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

    await expect(purgeDrop("expired-drop")).rejects.toThrow(/pedidos/);
    expectNothingDeleted(tx);
  });

  it("refuses when a purgeable order carries a payment review reason", async () => {
    const tx = buildTransaction({
      orders: [
        { paymentStatus: "FAILED", paymentReviewReason: "LATE_PAYMENT" },
      ],
    });

    await expect(purgeDrop("expired-drop")).rejects.toThrow(/pedidos/);
    expectNothingDeleted(tx);
  });

  it("counts orders reached only through the dropName snapshot", async () => {
    const tx = buildTransaction({
      products: [],
      orders: [{ paymentStatus: "PAID", paymentReviewReason: null }],
    });

    await expect(purgeDrop("expired-drop")).rejects.toThrow(/pedidos/);

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

      await purgeDrop("expired-drop");

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

    await purgeDrop("expired-drop");

    expect(tx.stockReservation.deleteMany).not.toHaveBeenCalled();
    expect(tx.order.deleteMany).not.toHaveBeenCalled();
    expect(tx.stockItem.deleteMany).toHaveBeenCalled();
    expect(tx.drop.delete).toHaveBeenCalledWith({
      where: { id: "expired-drop" },
    });
  });
});
