import { afterEach, describe, expect, it, vi } from "vitest";

const TOKEN = "0123456789abcdef0123456789abcdef";

const payer = {
  orderId: "order-1",
  idempotencyKey: "key-1",
  amount: 50,
  email: "maria@example.com",
  description: "Order #order-1",
  firstName: "Maria",
  lastName: "Silva",
  phone: "11999999999",
  cpf: "52998224725",
};

const cardInput = {
  ...payer,
  token: TOKEN,
  paymentMethodId: "master",
  paymentTypeId: "credit_card" as const,
  installments: 3,
};

// MERCADOPAGO_ACCESS_TOKEN is read when the module loads, so stub it first.
async function loadService() {
  vi.resetModules();
  vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "test-access-token");
  return import("./mercadopago.service");
}

function mockFetch(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 201,
    statusText: "",
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sentBody = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse(fetchMock.mock.calls[0][1].body as string);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createPixOrder", () => {
  it("keeps the Pix request and response shape unchanged", async () => {
    const fetchMock = mockFetch({
      id: "ORD1",
      status: "action_required",
      transactions: {
        payments: [
          {
            id: "PAY1",
            payment_method: { qr_code: "qr", qr_code_base64: "b64" },
          },
        ],
      },
    });
    const { createPixOrder } = await loadService();
    const result = await createPixOrder(payer);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.mercadopago.com/v1/orders",
    );
    expect(fetchMock.mock.calls[0][1].headers["X-Idempotency-Key"]).toBe(
      "key-1",
    );
    expect(sentBody(fetchMock)).toEqual({
      type: "online",
      external_reference: "order-1",
      total_amount: "50.00",
      processing_mode: "automatic",
      payer: {
        email: "maria@example.com",
        first_name: "Maria",
        last_name: "Silva",
        identification: { type: "CPF", number: "52998224725" },
        phone: { area_code: "11", number: "999999999" },
      },
      transactions: {
        payments: [
          {
            amount: "50.00",
            payment_method: { id: "pix", type: "bank_transfer" },
          },
        ],
      },
    });
    expect(result).toEqual({
      paymentId: "PAY1",
      orderId: "ORD1",
      qrCode: "qr",
      qrCodeBase64: "b64",
      status: "action_required",
    });
  });
});

describe("createCardOrder", () => {
  it("sends token, brand, type and installments without changing total_amount", async () => {
    const fetchMock = mockFetch({
      id: "ORD2",
      status: "processed",
      status_detail: "accredited",
      transactions: {
        payments: [
          { id: "PAY2", status: "processed", status_detail: "accredited" },
        ],
      },
    });
    const { createCardOrder } = await loadService();
    const result = await createCardOrder(cardInput);

    const body = sentBody(fetchMock);
    expect(body.total_amount).toBe("50.00");
    expect(body.transactions.payments).toEqual([
      {
        amount: "50.00",
        payment_method: {
          id: "master",
          type: "credit_card",
          token: TOKEN,
          installments: 3,
        },
      },
    ]);
    expect(fetchMock.mock.calls[0][1].headers["X-Idempotency-Key"]).toBe(
      "key-1",
    );
    expect(result).toEqual({
      paymentId: "PAY2",
      orderId: "ORD2",
      status: "processed",
      statusDetail: "accredited",
    });
  });

  it.each([0, 4, 1.5, -1])(
    "rejects %s installments before calling the provider",
    async (installments) => {
      const fetchMock = mockFetch({});
      const { createCardOrder } = await loadService();
      await expect(
        createCardOrder({ ...cardInput, installments }),
      ).rejects.toThrow(/parcelas/);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("requires a token", async () => {
    const fetchMock = mockFetch({});
    const { createCardOrder } = await loadService();
    await expect(createCardOrder({ ...cardInput, token: "" })).rejects.toThrow(
      /token/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces provider errors without logging or throwing the card token", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(
      {
        cause: [
          { code: "2067", description: "Invalid user identification number" },
        ],
      },
      { ok: false, status: 400 },
    );
    const { createCardOrder } = await loadService();

    const failure = await createCardOrder(cardInput).catch((e: Error) => e);
    expect((failure as Error).message).toBe(
      "Mercado Pago API Error: [2067] Invalid user identification number",
    );
    expect((failure as Error).message).not.toContain(TOKEN);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOKEN);
  });
  it("turns a 402 refusal into a typed error with the payment reason and no token in the logs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(
      {
        errors: [
          {
            code: "failed",
            message: "The following transactions failed",
            details: ["PAY1: rejected_by_issuer"],
          },
        ],
        data: {
          id: "ORDTST1",
          status: "failed",
          status_detail: "failed",
          transactions: {
            payments: [
              {
                id: "PAY1",
                status: "failed",
                status_detail: "rejected_by_issuer",
                payment_method: {
                  id: "master",
                  type: "credit_card",
                  token: TOKEN,
                  installments: 3,
                },
              },
            ],
          },
        },
      },
      { ok: false, status: 402 },
    );
    const { createCardOrder } = await loadService();
    const failure = await createCardOrder(cardInput).catch((e: unknown) => e);
    expect(failure).toMatchObject({
      name: "PaymentRejectedError",
      statusDetail: "rejected_by_issuer",
      message:
        "Mercado Pago API Error: [failed] The following transactions failed",
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOKEN);
  });
});
