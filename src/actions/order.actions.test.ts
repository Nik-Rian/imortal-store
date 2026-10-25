import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrder } from "./order.actions";
import { prisma } from "@/lib/prisma";

// Mock das dependências
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    productVariant: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
  },
}));

vi.mock("@/services/product.service", () => ({
  checkProductAvailability: vi.fn(),
}));

vi.mock("@/services/mercadopago.service", () => ({
  createPixOrder: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("createOrder Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPayload = {
    customerName: "Maria Silva",
    customerPhone: "11999999999",
    customerEmail: "maria@example.com",
    // CPF matematicamente válido gerado para o teste
    customerCpf: "52998224725",
    items: [{ productId: "prod-1", quantity: 1 }],
  };

  it("rejeita a criação com quantidade negativa (Prevenção de vulnerabilidade)", async () => {
    const result = await createOrder({
      ...validPayload,
      items: [{ productId: "prod-1", quantity: -2 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maior que zero/);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("rejeita a criação com quantidade decimal", async () => {
    const result = await createOrder({
      ...validPayload,
      items: [{ productId: "prod-1", quantity: 1.5 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/valor inteiro/);
  });

  it("rejeita a criação com quantidade zero", async () => {
    const result = await createOrder({
      ...validPayload,
      items: [{ productId: "prod-1", quantity: 0 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maior que zero/);
  });

  it("rejeita carrinho vazio", async () => {
    const result = await createOrder({ ...validPayload, items: [] });

    expect(result.success).toBe(false);
    expect(result.error).toBe("O carrinho está vazio.");
  });

  it("rejeita array de itens acima do limite", async () => {
    const oversizedItems = Array(51).fill({ productId: "prod-1", quantity: 1 });
    const result = await createOrder({
      ...validPayload,
      items: oversizedItems,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/excedeu o limite/);
  });

  it("rejeita informações inválidas de clientes (CPF incorreto)", async () => {
    const result = await createOrder({
      ...validPayload,
      customerCpf: "00000000000",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/CPF válido/);
  });
});
