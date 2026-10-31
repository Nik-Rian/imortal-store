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
  it("purges an expired drop and removes its blob images", async () => {
    const tx = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "p1", images: ["https://blob/x.png"] }]),
        deleteMany: vi.fn(),
      },
      orderItem: {
        findMany: vi.fn().mockResolvedValue([{ orderId: "o1" }]),
        deleteMany: vi.fn(),
      },
      order: { deleteMany: vi.fn() },
      productVariant: { deleteMany: vi.fn() },
      drop: { delete: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation(((
      callback: (client: typeof tx) => unknown,
    ) => callback(tx)) as never);

    await purgeDrop("expired-drop");

    expect(tx.drop.delete).toHaveBeenCalledWith({
      where: { id: "expired-drop" },
    });
    expect(deleteBlobImages).toHaveBeenCalledWith(["https://blob/x.png"]);
  });
});
