import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOrder, updateOrderStatus } from "./order.actions";
import { prisma } from "@/lib/prisma";
import { createPixOrder } from "@/services/mercadopago.service";
import { checkProductAvailability } from "@/services/product.service";

// Mock das dependências
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    productVariant: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth-guard", () => ({
  requireSession: vi.fn(),
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

describe("createOrder retry and duplicate protection", () => {
  const payload = {
    customerName: "Maria Silva",
    customerPhone: "11999999999",
    customerEmail: "maria@example.com",
    customerCpf: "52998224725",
    items: [{ productId: "prod-1", quantity: 1 }],
  };
  const retryPayload = {
    ...payload,
    orderId: "order-1",
    accessToken: "token-1",
  };
  const storedOrder = (overrides: Record<string, unknown> = {}) => ({
    id: "order-1",
    accessToken: "token-1",
    idempotencyKey: "key-1",
    status: "PENDING",
    paymentStatus: "PENDING",
    customerName: "Maria Silva",
    customerPhone: "11999999999",
    customerEmail: "maria@example.com",
    totalPriceCents: 5000,
    pixQrCode: null,
    mpPaymentId: null,
    ...overrides,
  });
  const pixResult = {
    paymentId: "pay-1",
    orderId: "ORD1",
    qrCode: "qr",
    qrCodeBase64: "b64",
    status: "action_required",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(createPixOrder).mockResolvedValue(pixResult);
    vi.mocked(prisma.order.update).mockResolvedValue({} as never);
    vi.mocked(checkProductAvailability).mockResolvedValue({
      available: true,
    } as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: "prod-1",
        name: "Camisa",
        priceCents: 5000,
        drop: { name: "Drop 1" },
        sizes: [],
      },
    ] as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["canceled", { status: "CANCELED" }],
    ["ready for pickup", { status: "READY_FOR_PICKUP" }],
    ["completed", { status: "COMPLETED" }],
    ["paid", { paymentStatus: "PAID" }],
    ["in review", { paymentStatus: "IN_REVIEW" }],
  ])(
    "never calls the provider for an order that is %s",
    async (_label, overrides) => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        storedOrder(overrides) as never,
      );
      const result = await createOrder(retryPayload);
      expect(result).toMatchObject({ success: true, orderId: "order-1" });
      expect(createPixOrder).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
    },
  );

  it("does not call the provider again once the Pix charge exists", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      storedOrder({ pixQrCode: "qr", mpPaymentId: "pay-1" }) as never,
    );
    const result = await createOrder(retryPayload);
    expect(result).toMatchObject({ success: true, orderId: "order-1" });
    expect(createPixOrder).not.toHaveBeenCalled();
  });

  it("does not return an access token for an order the caller does not own", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      storedOrder() as never,
    );
    const result = await createOrder({
      ...retryPayload,
      accessToken: "someone-elses-token",
    });
    expect(result.success).toBe(false);
    expect(result.accessToken).toBeUndefined();
    expect(result.orderId).toBeUndefined();
    expect(result).not.toHaveProperty("orderId");
    expect(createPixOrder).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("rejects a retry that supplies only the order id", async () => {
    const result = await createOrder({ ...payload, orderId: "order-1" });
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty("accessToken");
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(createPixOrder).not.toHaveBeenCalled();
  });

  it("returns the existing order for a repeated attempt key", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      storedOrder({ pixQrCode: "qr", mpPaymentId: "pay-1" }) as never,
    );
    const result = await createOrder({ ...payload, attemptKey: "key-1" });
    expect(result).toMatchObject({
      success: true,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { idempotencyKey: "key-1" },
    });
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(createPixOrder).not.toHaveBeenCalled();
  });

  it("resumes the winning order when two submissions with one attempt key race", async () => {
    vi.mocked(prisma.order.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storedOrder() as never);
    vi.mocked(prisma.order.create).mockRejectedValue(
      new Error("Unique constraint failed on idempotencyKey"),
    );
    const result = await createOrder({ ...payload, attemptKey: "key-1" });
    expect(result).toMatchObject({
      success: true,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
    expect(createPixOrder).toHaveBeenCalledTimes(1);
    expect(createPixOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1", idempotencyKey: "key-1" }),
    );
  });

  it("surfaces a create failure when no order exists for the key", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.order.create).mockRejectedValue(new Error("db down"));
    const result = await createOrder({ ...payload, attemptKey: "key-1" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("db down");
    expect(result.accessToken).toBeUndefined();
    expect(result.orderId).toBeUndefined();
    expect(createPixOrder).not.toHaveBeenCalled();
  });

  it("lets the customer retry the same order after a provider failure", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.order.create).mockResolvedValue(storedOrder() as never);
    vi.mocked(createPixOrder).mockRejectedValueOnce(
      new Error("Mercado Pago API Error: boom"),
    );

    const first = await createOrder({ ...payload, attemptKey: "key-1" });
    expect(first).toMatchObject({
      success: false,
      orderId: "order-1",
      accessToken: "token-1",
    });

    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      storedOrder() as never,
    );
    const second = await createOrder({
      ...payload,
      attemptKey: "key-1",
      orderId: first.orderId,
      accessToken: first.accessToken,
    });
    expect(second).toMatchObject({
      success: true,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
    expect(createPixOrder).toHaveBeenCalledTimes(2);
    expect(createPixOrder).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        idempotencyKey: "key-1",
        cpf: "52998224725",
      }),
    );
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1" },
        data: expect.objectContaining({ mpPaymentId: "pay-1" }),
      }),
    );
  });

  it("builds the payer from the stored order, not from the retry payload", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      storedOrder() as never,
    );
    await createOrder({
      ...retryPayload,
      customerName: "Joao Impostor",
      customerEmail: "other@example.com",
      customerPhone: "21988888888",
      items: [{ productId: "other-prod", quantity: 9 }],
    });
    expect(createPixOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Maria",
        lastName: "Silva",
        email: "maria@example.com",
        phone: "11999999999",
        amount: 50,
      }),
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
});

describe("createOrder variant and size selection", () => {
  const payload = {
    customerName: "Maria Silva",
    customerPhone: "11999999999",
    customerEmail: "maria@example.com",
    customerCpf: "52998224725",
    items: [{ productId: "prod-1", quantity: 1 }],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: "prod-1",
        name: "Camisa",
        priceCents: 5000,
        drop: { name: "Drop 1" },
        sizes: [],
      },
    ] as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a product-only line when the product requires a variant", async () => {
    vi.mocked(checkProductAvailability).mockResolvedValue({
      available: false,
      reason: "VARIANT_UNAVAILABLE",
    });

    const result = await createOrder(payload);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/variação/);
    // The action forwards the missing selection untouched to the rule.
    expect(checkProductAvailability).toHaveBeenCalledWith(
      "prod-1",
      undefined,
      undefined,
      1,
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(createPixOrder).not.toHaveBeenCalled();
  });

  it("still creates the order for a product without variants", async () => {
    vi.mocked(checkProductAvailability).mockResolvedValue({ available: true });
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order-1",
      accessToken: "token-1",
      idempotencyKey: "key-1",
      status: "PENDING",
      paymentStatus: "PENDING",
      customerName: "Maria Silva",
      customerPhone: "11999999999",
      customerEmail: "maria@example.com",
      totalPriceCents: 5000,
      pixQrCode: null,
      mpPaymentId: null,
    } as never);
    vi.mocked(prisma.order.update).mockResolvedValue({} as never);
    vi.mocked(createPixOrder).mockResolvedValue({
      paymentId: "pay-1",
      orderId: "ORD1",
      qrCode: "qr",
      qrCodeBase64: "b64",
      status: "action_required",
    });

    const result = await createOrder(payload);

    expect(result).toMatchObject({
      success: true,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a variant that belongs to a different product than the line", async () => {
    vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
      {
        id: "var-1",
        productId: "prod-2",
        name: "Preta",
        product: {
          id: "prod-2",
          name: "Outra",
          priceCents: 1000,
          drop: { name: "Drop 1" },
          sizes: [],
        },
      },
    ] as never);

    const result = await createOrder({
      ...payload,
      items: [{ productId: "prod-1", variantId: "var-1", quantity: 1 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/não pertence/);
    expect(checkProductAvailability).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});

describe("updateOrderStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
  });

  it.each(["SHIPPED", "constructor", "__proto__", "", "pending"])(
    "rejects the non-enum status %j without touching the database",
    async (status) => {
      const result = await updateOrderStatus("order-1", status as never);

      expect(result.success).toBe(false);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(["PENDING", "CANCELED"] as const)(
    "rejects moving an order to %s",
    async (status) => {
      const result = await updateOrderStatus("order-1", status);

      expect(result).toMatchObject({ success: false });
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    },
  );

  it("requires PENDING and PAID in the UPDATE itself to mark ready", async () => {
    const result = await updateOrderStatus("order-1", "READY_FOR_PICKUP");

    expect(result).toEqual({ success: true });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "PENDING", paymentStatus: "PAID" },
      data: { status: "READY_FOR_PICKUP" },
    });
  });

  it("completes only a READY_FOR_PICKUP order, whatever the payment status", async () => {
    const result = await updateOrderStatus("order-1", "COMPLETED");

    expect(result).toEqual({ success: true });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "READY_FOR_PICKUP" },
      data: { status: "COMPLETED" },
    });
  });

  it("reports an order that is not in the required state, such as an unpaid one", async () => {
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });

    const result = await updateOrderStatus("order-1", "READY_FOR_PICKUP");

    expect(result).toEqual({
      success: false,
      error: "Pedido não está elegível para esta transição.",
    });
  });
});
