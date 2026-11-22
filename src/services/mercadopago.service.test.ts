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

// A fetch that never answers by itself and rejects once its signal aborts.
function mockStalledFetch() {
  const fetchMock = vi.fn(
    (_url: unknown, init: { signal: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("This operation was aborted", "AbortError")),
        );
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type Service = Awaited<ReturnType<typeof loadService>>;

afterEach(() => {
  vi.useRealTimers();
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
            expiration_time: "PT30M",
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

  it("expires the Pix payment after 30 minutes", async () => {
    const fetchMock = mockFetch({
      id: "ORD1",
      status: "action_required",
      transactions: { payments: [{ id: "PAY1", payment_method: {} }] },
    });
    const { createPixOrder, PIX_EXPIRATION_TIME } = await loadService();
    await createPixOrder(payer);

    expect(PIX_EXPIRATION_TIME).toBe("PT30M");
    expect(sentBody(fetchMock).transactions.payments[0].expiration_time).toBe(
      "PT30M",
    );
  });

  it("redacts payer identification, e-mail, phone, name and card secrets from the logged provider error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(
      {
        message: "invalid_payer",
        data: {
          payer: {
            email: payer.email,
            first_name: "Maria",
            last_name: "Silva",
            identification: { type: "CPF", number: payer.cpf },
            phone: { area_code: "11", number: "999999999" },
          },
          transactions: {
            payments: [
              { payment_method: { token: TOKEN, security_code: "9071" } },
            ],
          },
        },
      },
      { ok: false, status: 400 },
    );
    const { createPixOrder } = await loadService();
    await createPixOrder(payer).catch(() => undefined);

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain("[redacted]");
    for (const secret of [
      payer.cpf,
      payer.email,
      "999999999",
      "Maria",
      "Silva",
      TOKEN,
      "9071",
    ]) {
      expect(logged).not.toContain(secret);
    }
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

describe("provider timeout", () => {
  it.each<[string, (service: Service) => Promise<unknown>]>([
    ["createPixOrder", (s) => s.createPixOrder(payer)],
    ["createCardOrder", (s) => s.createCardOrder(cardInput)],
    ["getMercadoPagoOrder", (s) => s.getMercadoPagoOrder("ORD1ABC")],
  ])(
    "aborts %s at the limit and raises the timeout error",
    async (_name, call) => {
      const fetchMock = mockStalledFetch();
      const service = await loadService();
      vi.useFakeTimers();

      const outcome = call(service).catch((e: unknown) => e);
      const { signal } = fetchMock.mock.calls[0][1];

      await vi.advanceTimersByTimeAsync(
        service.PROVIDER_REQUEST_TIMEOUT_MS - 1,
      );
      expect(signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signal.aborted).toBe(true);
      expect(await outcome).toBeInstanceOf(service.MercadoPagoTimeoutError);
    },
  );

  it("exports a 15 second limit", async () => {
    const { PROVIDER_REQUEST_TIMEOUT_MS } = await loadService();
    expect(PROVIDER_REQUEST_TIMEOUT_MS).toBe(15_000);
  });
});

describe("isMercadoPagoOrderId", () => {
  it("accepts Orders API ids and rejects other identifiers", async () => {
    const { isMercadoPagoOrderId } = await loadService();
    expect(isMercadoPagoOrderId("ORD01JQ4S4KY8HWQ6NA5PXB65B3D3")).toBe(true);
    expect(isMercadoPagoOrderId("123456789")).toBe(false);
    expect(isMercadoPagoOrderId("ord123")).toBe(false);
    expect(isMercadoPagoOrderId(123)).toBe(false);
  });
});

describe("getMercadoPagoOrder", () => {
  it("fetches the order with the bearer token, a signal and redirects refused, and maps the result", async () => {
    const fetchMock = mockFetch(
      {
        id: "ORD1ABC",
        status: "processed",
        status_detail: "accredited",
        total_amount: "50.00",
        total_paid_amount: "50.00",
        external_reference: "order-1",
        transactions: {
          payments: [
            {
              id: "PAY1",
              status: "processed",
              status_detail: "accredited",
              payment_method: { qr_code: "qr", qr_code_base64: "b64" },
            },
          ],
        },
      },
      { status: 200 },
    );
    const { getMercadoPagoOrder } = await loadService();
    const result = await getMercadoPagoOrder("ORD1ABC");

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.mercadopago.com/v1/orders/ORD1ABC",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer test-access-token" },
      redirect: "error",
    });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      orderId: "ORD1ABC",
      status: "processed",
      status_detail: "accredited",
      totalAmount: 50,
      totalPaidAmount: 50,
      externalReference: "order-1",
      payments: [
        {
          paymentId: "PAY1",
          status: "processed",
          statusDetail: "accredited",
          qrCode: "qr",
          qrCodeBase64: "b64",
        },
      ],
    });
  });

  it.each([
    "order-1",
    "ord123",
    "ORD",
    "ORD-1",
    `ORD${"A".repeat(62)}`,
    "../ORD1",
  ])("rejects the invalid id %j before calling the provider", async (id) => {
    const fetchMock = mockFetch({});
    const { getMercadoPagoOrder } = await loadService();
    await expect(getMercadoPagoOrder(id)).rejects.toThrow(
      "Invalid Mercado Pago order ID.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when the provider answers 404", async () => {
    mockFetch({}, { ok: false, status: 404 });
    const { getMercadoPagoOrder } = await loadService();
    await expect(getMercadoPagoOrder("ORD1ABC")).resolves.toBeNull();
  });

  it("throws on any other non-OK status", async () => {
    mockFetch({}, { ok: false, status: 500 });
    const { getMercadoPagoOrder } = await loadService();
    await expect(getMercadoPagoOrder("ORD1ABC")).rejects.toThrow(
      /Failed to fetch order ORD1ABC/,
    );
  });

  it("surfaces a refused redirect as a rejection", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const { getMercadoPagoOrder } = await loadService();

    await expect(getMercadoPagoOrder("ORD1ABC")).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });
});
