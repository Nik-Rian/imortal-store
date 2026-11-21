import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { APIError } from "better-auth/api";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminUser, deleteAdminUser } from "./user.actions";

vi.mock("@/lib/auth", () => ({
  auth: { api: { createUser: vi.fn() } },
}));
vi.mock("@/lib/auth-guard", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { count: vi.fn(), delete: vi.fn(), update: vi.fn() } },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "session=abc" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

function userForm(fields: Record<string, string> = {}) {
  const values = {
    name: "Ana",
    email: "ana@example.com",
    password: "senha-forte-1",
    ...fields,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({
    user: { id: "admin-1" },
  } as never);
  vi.mocked(auth.api.createUser).mockResolvedValue({
    user: { id: "u2", email: "ana@example.com" },
  } as never);
});

describe("createAdminUser", () => {
  it("creates the user with the admin role in a single call", async () => {
    await createAdminUser(userForm());

    expect(auth.api.createUser).toHaveBeenCalledWith({
      body: {
        email: "ana@example.com",
        password: "senha-forte-1",
        name: "Ana",
        role: "admin",
      },
      headers: expect.any(Headers),
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/admin/usuarios");
  });

  it("does nothing when the caller is not an admin", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("Não autorizado."));

    await expect(createAdminUser(userForm())).rejects.toThrow(
      "Não autorizado.",
    );
    expect(auth.api.createUser).not.toHaveBeenCalled();
  });

  it("rejects missing fields", async () => {
    const result = await createAdminUser(userForm({ password: "" }));

    expect(result).toEqual({
      success: false,
      error: "Preencha nome, e-mail e senha.",
    });
    expect(auth.api.createUser).not.toHaveBeenCalled();
  });

  it("surfaces a createUser failure and does not redirect", async () => {
    vi.mocked(auth.api.createUser).mockRejectedValue(
      new APIError("BAD_REQUEST", { message: "User already exists." }),
    );

    const result = await createAdminUser(userForm());

    expect(result).toEqual({ success: false, error: "User already exists." });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("logs unexpected failures and returns a generic message", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(auth.api.createUser).mockRejectedValue(new Error("db down"));

    const result = await createAdminUser(userForm());

    expect(result.success).toBe(false);
    expect(result.error).not.toContain("db down");
    expect(redirect).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe("deleteAdminUser", () => {
  it("refuses to remove the caller", async () => {
    const result = await deleteAdminUser("admin-1");
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/próprio acesso/),
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("counts only admins and blocks removing the last one", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(1);

    const result = await deleteAdminUser("admin-2");
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/último usuário administrador/),
    });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { role: "admin" },
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("deletes when more than one admin exists", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(2);

    const result = await deleteAdminUser("admin-2");

    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: "admin-2" },
    });
    expect(result).toEqual({ success: true });
  });
});
