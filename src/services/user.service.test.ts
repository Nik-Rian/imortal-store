import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getUsers } from "./user.service";

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: vi.fn() } },
}));

describe("getUsers", () => {
  it("lists only admins", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);

    await getUsers();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: "admin" } }),
    );
  });
});
