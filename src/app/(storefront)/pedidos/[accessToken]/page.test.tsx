import { beforeEach, describe, expect, it, vi } from "vitest";
import OrderDetailPage, { generateMetadata } from "./page";

const { findUniqueMock, notFoundMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  // The real notFound() throws; the mock must throw too so the page stops
  // executing before it reads properties of a missing order.
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findUnique: findUniqueMock } },
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

// Payment sections are client components unrelated to metadata and 404 behavior.
vi.mock("@/components/storefront/OrderPixSection", () => ({
  OrderPixSection: () => null,
}));
vi.mock("@/components/storefront/OrderCardSection", () => ({
  OrderCardSection: () => null,
}));

describe("private order page metadata", () => {
  it("blocks indexing and suppresses the Referer header", () => {
    const metadata = generateMetadata();

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });
});

describe("private order page lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responds with not found for an unknown access token", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(
      OrderDetailPage({
        params: Promise.resolve({ accessToken: "unknown-token" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { accessToken: "unknown-token" },
      include: { items: true },
    });
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });
});
