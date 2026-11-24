import { inspect } from "node:util";
import { requireSession } from "@/lib/auth-guard";
import { describeCardFailure, PaymentRejectedError } from "@/lib/card-outcome";
import type {
  Catalogue,
  CatalogueProduct,
  StockRecord,
} from "@/lib/order-lines";
import { prisma } from "@/lib/prisma";
import { buildStockKey } from "@/lib/stock-key";
import { loadCheckoutCatalogue } from "@/services/checkout.service";
import {
  createCardOrder,
  createPixOrder,
  MercadoPagoTimeoutError,
} from "@/services/mercadopago.service";
import { reserveStock, StockReservationError } from "@/services/stock.service";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrder,
  markAllPaidAsReady,
  updateOrderStatus,
} from "./order.actions";

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
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth-guard", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/services/checkout.service", () => ({
  loadCheckoutCatalogue: vi.fn(),
}));

vi.mock("@/services/mercadopago.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/mercadopago.service")>()),
  createPixOrder: vi.fn(),
  createCardOrder: vi.fn(),
}));

vi.mock("@/services/stock.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/stock.service")>()),
  reserveStock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Hoisted so the limiter, created when the action module is imported, always
// starts from the default limits, and so each call can get its own client.
const testClient = vi.hoisted(() => {
  delete process.env.CHECKOUT_RATE_LIMIT_MAX;
  delete process.env.CHECKOUT_RATE_LIMIT_WINDOW_SECONDS;
  return { counter: 0 };
});

// Every call gets a distinct address by default, so the module-level limiter
// state never leaks quota between unrelated tests.
vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () =>
      new Headers({ "x-forwarded-for": `test-client-${++testClient.counter}` }),
  ),
}));

function makeProduct(
  overrides: Partial<CatalogueProduct> = {},
): CatalogueProduct {
  return {
    id: "prod-1",
    name: "Camisa",
    priceCents: 5000,
    isAvailable: true,
    controlStock: false,
    hasSizes: false,
    hasVariants: false,
    isBundle: false,
    drop: { name: "Drop 1", status: "ACTIVE" },
    variants: [],
    sizes: [],
    components: [],
    ...overrides,
  };
}

function makeCatalogue(
  products: CatalogueProduct[] = [makeProduct()],
  stock: StockRecord[] = [],
): Catalogue {
  return {
    products: new Map(products.map((p) => [p.id, p] as const)),
    stock: new Map(stock.map((s) => [s.stockKey, s] as const)),
  };
}

// The transaction callback receives the mocked client itself, so assertions on
// order creation keep targeting prisma.order.create.
function runTransactionsAgainstMockedClient() {
  vi.mocked(prisma.$transaction).mockImplementation(((
    callback: (tx: unknown) => Promise<unknown>,
  ) => callback(prisma)) as never);
}

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

  it.each(["customerPhone", "customerEmail"] as const)(
    "rejeita o pedido sem %s antes de acessar o banco",
    async (field) => {
      const payloadWithoutField: Partial<typeof validPayload> = {
        ...validPayload,
      };
      delete payloadWithoutField[field];

      const result = await createOrder(payloadWithoutField as never);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
      expect(prisma.order.findFirst).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(loadCheckoutCatalogue).not.toHaveBeenCalled();
    },
  );
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

  const SAFE_ORDER_FAILURE_MESSAGE =
    "Não foi possível processar o pedido agora. Tente novamente em instantes.";

  const PROVIDER_TIMEOUT_MESSAGE =
    "O serviço de pagamento demorou para responder. Aguarde um momento e tente novamente.";

  beforeEach(() => {
    vi.resetAllMocks();
    runTransactionsAgainstMockedClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(createPixOrder).mockResolvedValue(pixResult);
    vi.mocked(prisma.order.update).mockResolvedValue({} as never);
    vi.mocked(loadCheckoutCatalogue).mockResolvedValue(makeCatalogue());
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
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(reserveStock).not.toHaveBeenCalled();
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

  it("resumes the existing order after a rolled back attempt without reserving stock again", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(
      new Error("Unique constraint failed on idempotencyKey"),
    );
    vi.mocked(prisma.order.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storedOrder() as never);

    const result = await createOrder({ ...payload, attemptKey: "key-1" });

    expect(result).toMatchObject({
      success: true,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(reserveStock).not.toHaveBeenCalled();
    expect(createPixOrder).toHaveBeenCalledTimes(1);
  });

  it("hides a create failure behind a safe message when no order exists for the key", async () => {
    const failure = new Error("db down");
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.order.create).mockRejectedValue(failure);
    const result = await createOrder({ ...payload, attemptKey: "key-1" });
    expect(result.success).toBe(false);
    expect(result.error).toBe(SAFE_ORDER_FAILURE_MESSAGE);
    expect(result.error).not.toMatch(/db down/);
    expect(result.accessToken).toBeUndefined();
    expect(result.orderId).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      "Error creating order:",
      failure,
    );
    expect(createPixOrder).not.toHaveBeenCalled();
  });

  it("hides a provider error from the customer and keeps the retry credentials", async () => {
    const failure = new Error(
      "Mercado Pago API Error: access token is missing",
    );
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.order.create).mockResolvedValue(storedOrder() as never);
    vi.mocked(createPixOrder).mockRejectedValueOnce(failure);

    const result = await createOrder({ ...payload, attemptKey: "key-1" });

    expect(result).toMatchObject({
      success: false,
      error: SAFE_ORDER_FAILURE_MESSAGE,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(result.error).not.toMatch(/Mercado Pago|access token/);
    expect(console.error).toHaveBeenCalledWith(
      "Error creating order:",
      failure,
    );
  });

  it("reports a provider timeout with a specific message, keeps the retry credentials and retries with the same idempotency key", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.order.create).mockResolvedValue(storedOrder() as never);
    vi.mocked(createPixOrder).mockRejectedValueOnce(
      new MercadoPagoTimeoutError(),
    );

    const first = await createOrder({ ...payload, attemptKey: "key-1" });

    expect(first).toMatchObject({
      success: false,
      error: PROVIDER_TIMEOUT_MESSAGE,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(first.error).not.toBe(SAFE_ORDER_FAILURE_MESSAGE);
    expect(first).not.toHaveProperty("paymentRejected");

    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      storedOrder() as never,
    );
    const second = await createOrder({
      ...payload,
      attemptKey: "key-1",
      orderId: first.orderId,
      accessToken: first.accessToken,
    });

    expect(second).toMatchObject({ success: true, orderId: "order-1" });
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
    expect(createPixOrder).toHaveBeenCalledTimes(2);
    for (const [input] of vi.mocked(createPixOrder).mock.calls) {
      expect(input).toMatchObject({ idempotencyKey: "key-1" });
    }
  });

  it.each([
    ["a provider timeout", () => new MercadoPagoTimeoutError()],
    [
      "a generic provider error",
      () => new Error("Mercado Pago API Error: boom"),
    ],
    [
      "a refused payment",
      () =>
        new PaymentRejectedError(
          "Mercado Pago API Error: refused",
          "rejected_by_issuer",
        ),
    ],
  ])(
    "never writes the CPF or e-mail to the logs after %s",
    async (_label, makeError) => {
      vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.order.create).mockResolvedValue(storedOrder() as never);
      vi.mocked(createPixOrder).mockRejectedValueOnce(makeError());

      await createOrder({ ...payload, attemptKey: "key-1" });

      const logged = inspect(
        [
          vi.mocked(console.error).mock.calls,
          vi.mocked(console.warn).mock.calls,
        ],
        { depth: null },
      );
      expect(logged).not.toContain("52998224725");
      expect(logged).not.toContain("maria@example.com");
    },
  );

  it("hides a database error raised after the order exists and keeps the retry credentials", async () => {
    const failure = new Error("db down");
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.order.create).mockResolvedValue(storedOrder() as never);
    vi.mocked(prisma.order.update).mockRejectedValueOnce(failure);

    const result = await createOrder({ ...payload, attemptKey: "key-1" });

    expect(result).toMatchObject({
      success: false,
      error: SAFE_ORDER_FAILURE_MESSAGE,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(console.error).toHaveBeenCalledWith(
      "Error creating order:",
      failure,
    );
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
    expect(loadCheckoutCatalogue).not.toHaveBeenCalled();
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
    runTransactionsAgainstMockedClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(loadCheckoutCatalogue).mockResolvedValue(makeCatalogue());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a product-only line when the product requires a variant", async () => {
    vi.mocked(loadCheckoutCatalogue).mockResolvedValue(
      makeCatalogue([
        makeProduct({
          hasVariants: true,
          variants: [{ id: "var-1", name: "Preta", isAvailable: true }],
        }),
      ]),
    );

    const result = await createOrder(payload);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/variação/);
    // The missing selection reaches the rule untouched and is reported.
    expect(console.warn).toHaveBeenCalledWith(
      "[createOrder] Item unavailable",
      expect.objectContaining({
        productId: "prod-1",
        reason: "VARIANT_UNAVAILABLE",
      }),
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(createPixOrder).not.toHaveBeenCalled();
  });

  it("still creates the order for a product without variants", async () => {
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
    vi.mocked(loadCheckoutCatalogue).mockResolvedValue(
      makeCatalogue([
        makeProduct({
          id: "prod-2",
          name: "Outra",
          priceCents: 1000,
          hasVariants: true,
          variants: [{ id: "var-1", name: "Preta", isAvailable: true }],
        }),
      ]),
    );

    const result = await createOrder({
      ...payload,
      items: [{ productId: "prod-1", variantId: "var-1", quantity: 1 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/não pertence/);
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(createPixOrder).not.toHaveBeenCalled();
  });
});

describe("createOrder bundles and shared stock", () => {
  const SAFE_ORDER_FAILURE_MESSAGE =
    "Não foi possível processar o pedido agora. Tente novamente em instantes.";

  const SHIRT_M = buildStockKey("prod-1", null, "size-m");
  const CAP_BLUE = buildStockKey("prod-cap", "var-blue", null);

  const shirt = makeProduct({
    id: "prod-1",
    name: "Camisa",
    priceCents: 5000,
    controlStock: true,
    hasSizes: true,
    sizes: [
      { id: "size-m", size: "M", isAvailable: true },
      { id: "size-g", size: "G", isAvailable: true },
    ],
  });
  const cap = makeProduct({
    id: "prod-cap",
    name: "Boné",
    priceCents: 3000,
    controlStock: true,
    hasVariants: true,
    variants: [{ id: "var-blue", name: "Azul", isAvailable: true }],
  });
  const kit = makeProduct({
    id: "prod-kit",
    name: "Kit Calouro",
    priceCents: 12000,
    isBundle: true,
    components: [
      { componentProductId: "prod-cap", quantity: 1 },
      { componentProductId: "prod-1", quantity: 1 },
    ],
  });

  const stock = (shirtOnHand = 5, capOnHand = 5): StockRecord[] => [
    { stockKey: SHIRT_M, onHand: shirtOnHand, reserved: 0, isAvailable: true },
    { stockKey: CAP_BLUE, onHand: capOnHand, reserved: 0, isAvailable: true },
  ];

  const kitSelection = [
    { componentProductId: "prod-cap", variantId: "var-blue" },
    { componentProductId: "prod-1", sizeId: "size-m" },
  ];
  const kitLine = (quantity = 1) => ({
    productId: "prod-kit",
    quantity,
    components: kitSelection,
  });
  const shirtLine = (quantity = 1) => ({
    productId: "prod-1",
    sizeId: "size-m",
    quantity,
  });

  const basePayload = {
    customerName: "Maria Silva",
    customerPhone: "11999999999",
    customerEmail: "maria@example.com",
    customerCpf: "52998224725",
  };

  const useCatalogue = (
    products: CatalogueProduct[] = [kit, cap, shirt],
    stockRows: StockRecord[] = stock(),
  ) =>
    vi
      .mocked(loadCheckoutCatalogue)
      .mockResolvedValue(makeCatalogue(products, stockRows));

  beforeEach(() => {
    vi.resetAllMocks();
    runTransactionsAgainstMockedClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    useCatalogue();
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order-1",
      accessToken: "token-1",
      idempotencyKey: "key-1",
      status: "PENDING",
      paymentStatus: "PENDING",
      customerName: "Maria Silva",
      customerPhone: "11999999999",
      customerEmail: "maria@example.com",
      totalPriceCents: 24000,
      pixQrCode: null,
      mpPaymentId: null,
      paymentMethod: "PIX",
    } as never);
    vi.mocked(prisma.order.update).mockResolvedValue({} as never);
    vi.mocked(createPixOrder).mockResolvedValue({
      paymentId: "pay-1",
      orderId: "ORD1",
      qrCode: "qr",
      qrCodeBase64: "b64",
      status: "action_required",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prices a bundle with its own price and persists the composition snapshot", async () => {
    const result = await createOrder({
      ...basePayload,
      items: [kitLine(2)],
    });

    expect(result).toMatchObject({ success: true, orderId: "order-1" });
    expect(loadCheckoutCatalogue).toHaveBeenCalledTimes(1);
    expect(prisma.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        totalPriceCents: 24000,
        items: {
          create: [
            {
              productId: "prod-kit",
              productName: "Kit Calouro",
              dropName: "Drop 1",
              variantName: null,
              sizeLabel: null,
              unitPriceCents: 12000,
              quantity: 2,
              components: {
                create: [
                  {
                    productId: "prod-cap",
                    productName: "Boné",
                    variantName: "Azul",
                    sizeLabel: null,
                    quantity: 1,
                  },
                  {
                    productId: "prod-1",
                    productName: "Camisa",
                    variantName: null,
                    sizeLabel: "M",
                    quantity: 1,
                  },
                ],
              },
            },
          ],
        },
      }),
    });
  });

  it("reserves the aggregated demand of every line and component inside the order transaction", async () => {
    const result = await createOrder({
      ...basePayload,
      items: [shirtLine(1), kitLine(1)],
    });

    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(reserveStock).toHaveBeenCalledTimes(1);
    expect(reserveStock).toHaveBeenCalledWith(prisma, "order-1", [
      expect.objectContaining({ stockKey: SHIRT_M, quantity: 2 }),
      expect.objectContaining({ stockKey: CAP_BLUE, quantity: 1 }),
    ]);

    const firstCall = (mock: { mock: { invocationCallOrder: number[] } }) =>
      mock.mock.invocationCallOrder[0];
    expect(firstCall(vi.mocked(prisma.order.create))).toBeLessThan(
      firstCall(vi.mocked(reserveStock)),
    );
  });

  it("creates the provider charge only after the reservation transaction has committed", async () => {
    const events: string[] = [];
    vi.mocked(prisma.$transaction).mockImplementation((async (
      callback: (tx: unknown) => Promise<unknown>,
    ) => {
      const created = await callback(prisma);
      events.push("committed");
      return created;
    }) as never);
    vi.mocked(createPixOrder).mockImplementation(async () => {
      events.push("provider");
      return {
        paymentId: "pay-1",
        orderId: "ORD1",
        qrCode: "qr",
        qrCodeBase64: "b64",
        status: "action_required",
      };
    });

    const result = await createOrder({
      ...basePayload,
      items: [shirtLine()],
    });

    expect(result.success).toBe(true);
    expect(events).toEqual(["committed", "provider"]);
  });

  it("maps a reservation that loses the race to the out-of-stock message without calling the provider", async () => {
    vi.mocked(reserveStock).mockRejectedValue(
      new StockReservationError({
        reason: "OUT_OF_STOCK",
        productId: "prod-cap",
        productName: "Boné",
        variantId: "var-blue",
        variantName: "Azul",
        sizeId: null,
        sizeLabel: null,
        bundleName: "Kit Calouro",
      }),
    );

    const result = await createOrder({
      ...basePayload,
      items: [kitLine()],
      attemptKey: "key-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Kit Calouro/);
    expect(result.error).toMatch(/Boné/);
    expect(result.error).toMatch(/Azul/);
    expect(result.error).not.toBe(SAFE_ORDER_FAILURE_MESSAGE);
    expect(result.orderId).toBeUndefined();
    expect(result).not.toHaveProperty("accessToken");
    // Only the initial lookup runs: a stock failure is not an idempotency conflict.
    expect(prisma.order.findFirst).toHaveBeenCalledTimes(1);
    expect(createPixOrder).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("keeps the plain line snapshot unchanged and without components", async () => {
    await createOrder({ ...basePayload, items: [shirtLine(2)] });

    expect(prisma.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        totalPriceCents: 10000,
        items: {
          create: [
            {
              productId: "prod-1",
              productName: "Camisa",
              dropName: "Drop 1",
              variantName: null,
              sizeLabel: "M",
              unitPriceCents: 5000,
              quantity: 2,
            },
          ],
        },
      }),
    });
  });

  it("totals a mixed cart and adds components only to the bundle line", async () => {
    await createOrder({
      ...basePayload,
      items: [shirtLine(2), kitLine(1)],
    });

    const [{ data }] = vi.mocked(prisma.order.create).mock.calls[0];
    const created = data as unknown as {
      totalPriceCents: number;
      items: { create: Record<string, unknown>[] };
    };
    expect(created.totalPriceCents).toBe(5000 * 2 + 12000);
    expect(created.items.create).toHaveLength(2);
    expect(created.items.create[0]).not.toHaveProperty("components");
    expect(created.items.create[1]).toHaveProperty("components");
  });

  const invalidSelections: [
    string,
    (
      | { componentProductId: string; variantId?: string; sizeId?: string }[]
      | undefined
    ),
    RegExp,
  ][] = [
    ["no components", undefined, /Selecione as opções de todos/],
    [
      "a missing component",
      [{ componentProductId: "prod-cap", variantId: "var-blue" }],
      /Selecione as opções de todos/,
    ],
    [
      "a product that is not part of the kit",
      [...kitSelection, { componentProductId: "prod-other" }],
      /não faz parte do kit/,
    ],
    [
      "a variant of another product",
      [
        { componentProductId: "prod-cap", variantId: "var-other" },
        { componentProductId: "prod-1", sizeId: "size-m" },
      ],
      /não pertence/,
    ],
    [
      "no variant for a component with variants",
      [
        { componentProductId: "prod-cap" },
        { componentProductId: "prod-1", sizeId: "size-m" },
      ],
      /Selecione a variação/,
    ],
    [
      "no size for a component with sizes",
      [
        { componentProductId: "prod-cap", variantId: "var-blue" },
        { componentProductId: "prod-1" },
      ],
      /Selecione o tamanho/,
    ],
  ];

  it.each(invalidSelections)(
    "rejects a bundle line with %s",
    async (_label, components, expected) => {
      const result = await createOrder({
        ...basePayload,
        items: [{ productId: "prod-kit", quantity: 1, components }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(expected);
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(createPixOrder).not.toHaveBeenCalled();
    },
  );

  it("rejects a duplicated component before touching the database", async () => {
    const result = await createOrder({
      ...basePayload,
      items: [
        {
          productId: "prod-kit",
          quantity: 1,
          components: [kitSelection[0], kitSelection[0]],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/uma única vez/);
    expect(loadCheckoutCatalogue).not.toHaveBeenCalled();
  });

  it("rejects component selections on a line that is not a bundle", async () => {
    const result = await createOrder({
      ...basePayload,
      items: [
        {
          ...shirtLine(),
          components: [
            { componentProductId: "prod-cap", variantId: "var-blue" },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/não é um kit/);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("rejects products that were not found", async () => {
    useCatalogue([], []);

    const result = await createOrder({
      ...basePayload,
      items: [shirtLine()],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/não foram encontrados/);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("accepts a bundle and a component line that fit the stock together", async () => {
    useCatalogue([kit, cap, shirt], stock(2, 5));

    const result = await createOrder({
      ...basePayload,
      items: [shirtLine(1), kitLine(1)],
    });

    expect(result.success).toBe(true);
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a cart whose lines fit the stock one by one but not together", async () => {
    useCatalogue([kit, cap, shirt], stock(1, 5));

    const alone = await createOrder({ ...basePayload, items: [kitLine(1)] });
    expect(alone.success).toBe(true);

    vi.mocked(prisma.order.create).mockClear();
    const combined = await createOrder({
      ...basePayload,
      items: [shirtLine(1), kitLine(1)],
    });

    expect(combined.success).toBe(false);
    expect(combined.error).toMatch(/Kit Calouro/);
    expect(combined.error).toMatch(/Camisa/);
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(createPixOrder).toHaveBeenCalledTimes(1);
  });

  it("names the bundle and the component option when a component has no stock", async () => {
    useCatalogue([kit, cap, shirt], stock(5, 0));

    const result = await createOrder({ ...basePayload, items: [kitLine()] });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Kit Calouro/);
    expect(result.error).toMatch(/Boné/);
    expect(result.error).toMatch(/Azul/);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("rejects a bundle whose selected component variant is unavailable", async () => {
    useCatalogue([
      kit,
      {
        ...cap,
        variants: [{ id: "var-blue", name: "Azul", isAvailable: false }],
      },
      shirt,
    ]);

    const result = await createOrder({ ...basePayload, items: [kitLine()] });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Kit Calouro/);
    expect(result.error).toMatch(/Boné/);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("still orders a bundle whose component product is closed for sale", async () => {
    useCatalogue([kit, cap, { ...shirt, isAvailable: false }]);

    const result = await createOrder({ ...basePayload, items: [kitLine()] });

    expect(result.success).toBe(true);
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a bundle whose own listing is closed", async () => {
    useCatalogue([{ ...kit, isAvailable: false }, cap, shirt]);

    const result = await createOrder({ ...basePayload, items: [kitLine()] });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Kit Calouro/);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("hides an unexpected loading failure behind the generic message", async () => {
    const failure = new Error("db down");
    vi.mocked(loadCheckoutCatalogue).mockRejectedValue(failure);

    const result = await createOrder({ ...basePayload, items: [kitLine()] });

    expect(result.success).toBe(false);
    expect(result.error).toBe(SAFE_ORDER_FAILURE_MESSAGE);
    expect(result.error).not.toMatch(/db down/);
    expect(result.orderId).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      "Error creating order:",
      failure,
    );
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

  it("requires a PENDING and PAID order in the UPDATE itself to start preparing", async () => {
    const result = await updateOrderStatus("order-1", "PREPARING");

    expect(result).toEqual({ success: true });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        status: { in: ["PENDING"] },
        paymentStatus: "PAID",
      },
      data: { status: "PREPARING" },
    });
  });

  it("accepts PENDING or PREPARING plus PAID in the UPDATE itself to mark ready", async () => {
    const result = await updateOrderStatus("order-1", "READY_FOR_PICKUP");

    expect(result).toEqual({ success: true });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        status: { in: ["PENDING", "PREPARING"] },
        paymentStatus: "PAID",
      },
      data: { status: "READY_FOR_PICKUP" },
    });
  });

  it("completes only a READY_FOR_PICKUP order, whatever the payment status", async () => {
    const result = await updateOrderStatus("order-1", "COMPLETED");

    expect(result).toEqual({ success: true });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: { in: ["READY_FOR_PICKUP"] } },
      data: { status: "COMPLETED" },
    });
  });

  it("reports a refused move to PREPARING with the same message", async () => {
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });

    const result = await updateOrderStatus("order-1", "PREPARING");

    expect(result).toEqual({
      success: false,
      error: "Pedido não está elegível para esta transição.",
    });
  });
});

describe("markAllPaidAsReady", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 3 });
  });

  it("moves paid PENDING and PREPARING orders to READY_FOR_PICKUP and returns the count", async () => {
    const result = await markAllPaidAsReady();

    expect(result).toEqual({ updatedCount: 3 });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        paymentStatus: "PAID",
        status: { in: ["PENDING", "PREPARING"] },
      },
      data: { status: "READY_FOR_PICKUP" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/pedidos");
  });

  it("only targets paid orders, leaving unpaid ones untouched", async () => {
    await markAllPaidAsReady();

    const [{ where }] = vi.mocked(prisma.order.updateMany).mock.calls[0];
    expect(where).toMatchObject({ paymentStatus: "PAID" });
  });

  it("returns zero when no order is eligible", async () => {
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });

    await expect(markAllPaidAsReady()).resolves.toEqual({ updatedCount: 0 });
  });

  it("does not touch the database without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("Unauthorized"));

    await expect(markAllPaidAsReady()).rejects.toThrow("Unauthorized");
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});

describe("createOrder card payments", () => {
  const TOKEN = "0123456789abcdef0123456789abcdef";
  const cardPayload = {
    customerName: "Maria Silva",
    customerPhone: "11999999999",
    customerEmail: "maria@example.com",
    customerCpf: "52998224725",
    items: [{ productId: "prod-1", quantity: 1 }],
    paymentMethod: "CARD" as const,
    card: {
      token: TOKEN,
      paymentMethodId: "master",
      paymentTypeId: "credit_card" as const,
      installments: 3,
    },
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
    paymentMethod: "PIX",
    ...overrides,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    runTransactionsAgainstMockedClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(createCardOrder).mockResolvedValue({
      paymentId: "pay-1",
      orderId: "ORD1",
      status: "processed",
      statusDetail: "accredited",
    });
    vi.mocked(createPixOrder).mockResolvedValue({
      paymentId: "pay-2",
      orderId: "ORD2",
      qrCode: "qr",
      qrCodeBase64: "b64",
      status: "action_required",
    });
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.order.create).mockResolvedValue(storedOrder() as never);
    vi.mocked(prisma.order.update).mockResolvedValue({} as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(loadCheckoutCatalogue).mockResolvedValue(makeCatalogue());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the card charge from the stored total and persists provider data", async () => {
    const result = await createOrder({ ...cardPayload, attemptKey: "key-1" });
    expect(result).toMatchObject({
      success: true,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(createPixOrder).not.toHaveBeenCalled();
    expect(createCardOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        idempotencyKey: "key-1",
        amount: 50,
        token: TOKEN,
        paymentMethodId: "master",
        paymentTypeId: "credit_card",
        installments: 3,
        cpf: "52998224725",
      }),
    );
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        paymentMethod: "CARD",
        installments: 3,
        mpPaymentId: "pay-1",
        mpOrderId: "ORD1",
      },
    });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", providerStatus: null },
      data: { providerStatus: "processed", providerStatusDetail: "accredited" },
    });
  });

  it.each([0, 4, 1.5])(
    "rejects %s installments before creating anything",
    async (installments) => {
      const result = await createOrder({
        ...cardPayload,
        card: { ...cardPayload.card, installments },
      });
      expect(result.success).toBe(false);
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(createCardOrder).not.toHaveBeenCalled();
    },
  );

  it("limits the installments message to the configured maximum", async () => {
    const result = await createOrder({
      ...cardPayload,
      card: { ...cardPayload.card, installments: 4 },
    });
    expect(result.error).toMatch(/3x/);
  });

  it("rejects debit cards with installments", async () => {
    const result = await createOrder({
      ...cardPayload,
      card: { ...cardPayload.card, paymentTypeId: "debit_card" },
    });
    expect(result.success).toBe(false);
    expect(createCardOrder).not.toHaveBeenCalled();
  });

  it("requires card data for a card payment and refuses it for Pix", async () => {
    const missing = await createOrder({ ...cardPayload, card: undefined });
    expect(missing.error).toBe("Dados do cartão ausentes.");
    const extra = await createOrder({
      ...cardPayload,
      paymentMethod: undefined,
    });
    expect(extra.error).toMatch(/não são aceitos/);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("refuses raw card fields instead of processing them", async () => {
    const result = await createOrder({
      ...cardPayload,
      card: { ...cardPayload.card, cardNumber: "4111111111111111" } as never,
    });
    expect(result.success).toBe(false);
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(createCardOrder).not.toHaveBeenCalled();
  });

  it("never creates a second charge once a card charge exists", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      storedOrder({
        mpPaymentId: "pay-1",
        mpOrderId: "ORD1",
        paymentMethod: "CARD",
      }) as never,
    );
    const result = await createOrder({
      ...cardPayload,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(result).toMatchObject({ success: true, orderId: "order-1" });
    expect(createCardOrder).not.toHaveBeenCalled();
    expect(createPixOrder).not.toHaveBeenCalled();
  });

  it("keeps the order retryable and stores nothing when the provider call fails", async () => {
    vi.mocked(createCardOrder).mockRejectedValueOnce(
      new Error("Mercado Pago API Error: boom"),
    );
    const result = await createOrder({ ...cardPayload, attemptKey: "key-1" });
    expect(result).toMatchObject({
      success: false,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("treats a card provider timeout as retryable, not as a refusal", async () => {
    vi.mocked(createCardOrder).mockRejectedValueOnce(
      new MercadoPagoTimeoutError(),
    );
    const result = await createOrder({ ...cardPayload, attemptKey: "key-1" });
    expect(result).toMatchObject({
      success: false,
      orderId: "order-1",
      accessToken: "token-1",
    });
    expect(result.error).toMatch(/demorou/);
    expect(result).not.toHaveProperty("paymentRejected");
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("still creates a Pix charge when no payment method is given", async () => {
    const { paymentMethod: _method, card: _card, ...pixPayload } = cardPayload;
    void _method;
    void _card;
    const result = await createOrder({ ...pixPayload, attemptKey: "key-1" });
    expect(result.success).toBe(true);
    expect(createPixOrder).toHaveBeenCalledTimes(1);
    expect(createCardOrder).not.toHaveBeenCalled();
  });

  it("reports a refused card with a customer message and no retry credentials", async () => {
    vi.mocked(createCardOrder).mockRejectedValueOnce(
      new PaymentRejectedError(
        "Mercado Pago API Error: [failed] The following transactions failed",
        "rejected_by_issuer",
      ),
    );
    const result = await createOrder({ ...cardPayload, attemptKey: "key-1" });
    expect(result).toMatchObject({
      success: false,
      paymentRejected: true,
      error: describeCardFailure("rejected_by_issuer"),
    });
    expect(result.error).not.toMatch(/Mercado Pago/);
    expect(result).not.toHaveProperty("orderId");
    expect(result).not.toHaveProperty("accessToken");
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});

describe("createOrder rate limiting", () => {
  const RATE_LIMIT_MESSAGE =
    "Muitos pedidos foram iniciados em pouco tempo. Aguarde alguns minutos e tente novamente.";
  const payload = {
    customerName: "Maria Silva",
    customerPhone: "11999999999",
    customerEmail: "maria@example.com",
    customerCpf: "52998224725",
    items: [{ productId: "prod-1", quantity: 1 }],
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
    paymentMethod: "PIX",
    ...overrides,
  });
  const useClientAddress = (address: string) => {
    vi.mocked(headers).mockResolvedValue(
      new Headers({ "x-forwarded-for": address }) as never,
    );
  };

  beforeEach(() => {
    vi.resetAllMocks();
    runTransactionsAgainstMockedClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(createPixOrder).mockResolvedValue({
      paymentId: "pay-1",
      orderId: "ORD1",
      qrCode: "qr",
      qrCodeBase64: "b64",
      status: "action_required",
    });
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.order.create).mockResolvedValue(storedOrder() as never);
    vi.mocked(prisma.order.update).mockResolvedValue({} as never);
    vi.mocked(loadCheckoutCatalogue).mockResolvedValue(makeCatalogue());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses the ninth new order from one address inside the window and creates nothing", async () => {
    useClientAddress("203.0.113.10");

    for (let attempt = 1; attempt <= 8; attempt++) {
      const accepted = await createOrder(payload);
      expect(accepted.success).toBe(true);
    }
    expect(prisma.order.create).toHaveBeenCalledTimes(8);
    expect(createPixOrder).toHaveBeenCalledTimes(8);

    const refused = await createOrder(payload);

    expect(refused).toEqual({ success: false, error: RATE_LIMIT_MESSAGE });
    expect(prisma.$transaction).toHaveBeenCalledTimes(8);
    expect(prisma.order.create).toHaveBeenCalledTimes(8);
    expect(reserveStock).toHaveBeenCalledTimes(8);
    expect(createPixOrder).toHaveBeenCalledTimes(8);
  });

  it("keeps a separate quota for each client address", async () => {
    useClientAddress("203.0.113.20");
    for (let attempt = 1; attempt <= 8; attempt++) {
      await createOrder(payload);
    }
    expect((await createOrder(payload)).success).toBe(false);

    useClientAddress("203.0.113.21");
    const otherClient = await createOrder(payload);

    expect(otherClient.success).toBe(true);
  });

  it("never counts retries of an existing pending order", async () => {
    useClientAddress("203.0.113.30");
    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      storedOrder() as never,
    );

    for (let attempt = 1; attempt <= 10; attempt++) {
      const result = await createOrder({
        ...payload,
        orderId: "order-1",
        accessToken: "token-1",
      });
      expect(result).toMatchObject({ success: true, orderId: "order-1" });
    }

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("never counts the resume of an existing order found by attempt key", async () => {
    useClientAddress("203.0.113.40");
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      storedOrder({ pixQrCode: "qr", mpPaymentId: "pay-1" }) as never,
    );

    for (let attempt = 1; attempt <= 10; attempt++) {
      const result = await createOrder({ ...payload, attemptKey: "key-1" });
      expect(result).toMatchObject({ success: true, orderId: "order-1" });
    }

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(createPixOrder).not.toHaveBeenCalled();
  });

  it("does not consume quota for carts rejected before an order would be created", async () => {
    useClientAddress("203.0.113.50");
    vi.mocked(loadCheckoutCatalogue).mockResolvedValue(
      makeCatalogue([
        makeProduct({
          hasVariants: true,
          variants: [{ id: "var-1", name: "Preta", isAvailable: true }],
        }),
      ]),
    );

    for (let attempt = 1; attempt <= 10; attempt++) {
      const rejected = await createOrder(payload);
      expect(rejected.success).toBe(false);
      expect(rejected.error).not.toBe(RATE_LIMIT_MESSAGE);
    }

    vi.mocked(loadCheckoutCatalogue).mockResolvedValue(makeCatalogue());
    const accepted = await createOrder(payload);

    expect(accepted.success).toBe(true);
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
  });
});
