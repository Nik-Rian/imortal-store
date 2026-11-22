import { prisma } from "@/lib/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminOrders } from "./order.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findMany: vi.fn() },
  },
}));

// cache() memoizes per request in the app; a pass-through keeps each test
// independent.
vi.mock("react", () => ({
  cache: <T>(fn: T) => fn,
}));

describe("getAdminOrders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.order.findMany).mockResolvedValue([]);
  });

  it("includes paid PREPARING orders in the valid-for-pickup list", async () => {
    await getAdminOrders("valid");

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: {
        paymentStatus: "PAID",
        status: { in: ["PENDING", "PREPARING", "READY_FOR_PICKUP"] },
      },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });
  });

  it("applies no filter to the full list", async () => {
    await getAdminOrders("all");

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });
  });
});
