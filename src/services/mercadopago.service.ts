const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MP_BASE_URL = "https://api.mercadopago.com";
import { inspect } from "node:util";
import { MAX_CARD_INSTALLMENTS } from "@/lib/validations/checkout.schema";
import { PaymentRejectedError } from "@/lib/card-outcome";

export interface CreatePixPaymentInput {
  orderId: string;
  idempotencyKey?: string;
  amount: number;
  email?: string | null;
  description: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  cpf: string;
}

export interface CreatePixPaymentResult {
  paymentId: string;
  orderId?: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl?: string;
  status: string;
}

export interface CreateCardPaymentInput extends CreatePixPaymentInput {
  /** Single-use token generated in the browser by Mercado Pago's SDK. A secret: never log it. */
  token: string;
  /** Card brand as reported by the SDK (e.g. "visa", "master"). */
  paymentMethodId: string;
  paymentTypeId: "credit_card" | "debit_card";
  installments: number;
}
export interface CreateCardPaymentResult {
  paymentId: string;
  orderId: string;
  status: string;
  statusDetail?: string;
}

export interface MercadoPagoPaymentDetails {
  paymentId: string;
  orderId?: string;
  status: string;
  externalReference?: string;
  statusDetail?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
}

export interface MercadoPagoOrderDetails {
  orderId: string;
  status: string;
  status_detail?: string;
  totalAmount: number;
  totalPaidAmount: number;
  externalReference?: string;
  payments: Array<{
    paymentId: string;
    status: string;
    statusDetail?: string;
    qrCode?: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
  }>;
}


type PayerInput = Pick<
  CreatePixPaymentInput,
  "email" | "firstName" | "lastName" | "phone" | "cpf"
>;

function buildPayer(input: PayerInput) {
  const cleanedCpf = input.cpf.replace(/\D/g, "");
  if (cleanedCpf.length !== 11) {
    throw new Error("Mercado Pago API Error: CPF do pagador é inválido.");
  }
  const trimmedEmail = input.email?.trim();
  if (!trimmedEmail) {
    throw new Error("Mercado Pago API Error: E-mail do cliente é obrigatório.");
  }
  const cleanedPhone = input.phone ? input.phone.replace(/\D/g, "") : undefined;
  const phonePayload =
    cleanedPhone && cleanedPhone.length >= 10
      ? {
          phone: {
            area_code: cleanedPhone.slice(0, 2),
            number: cleanedPhone.slice(2),
          },
        }
      : {};
  return {
    email: trimmedEmail,
    ...(input.firstName?.trim() ? { first_name: input.firstName.trim() } : {}),
    ...(input.lastName?.trim() ? { last_name: input.lastName.trim() } : {}),
    identification: {
      type: "CPF",
      number: cleanedCpf,
    },
    ...phonePayload,
  };
}

/** The provider echoes the single-use card token back in error bodies. */
function redactCardTokens(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, v) => (key === "token" ? "[redacted]" : v)),
  );
}

/**
 * POSTs to /v1/orders and returns the parsed response. The request body is
 * never logged (it can carry a card token); only the provider's error
 * response is.
 */
async function postOrder(body: unknown, idempotencyKey: string) {
  const response = await fetch(`${MP_BASE_URL}/v1/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    // util.inspect avoids Node's default console depth limit, which was
    // hiding nested arrays/objects as "[Object]" in prior logs.
    console.error(
      "Mercado Pago /v1/orders rejected request:",
      response.status,
      inspect(redactCardTokens(errorData), { depth: null }),
    );
    // MP uses different error shapes depending on the failure:
    // - "cause": schema/validation errors (e.g. required_properties, property_value)
    // - "errors": order created but a transaction failed (payment-level rejection)
    type MPCause = { code?: string; description?: string };
    type MPTransactionError = {
      code?: string;
      detail?: string;
      message?: string;
    };
    const causeMessage = Array.isArray(errorData.cause)
      ? (errorData.cause as MPCause[])
          .map((c) => `${c.code ? `[${c.code}] ` : ""}${c.description ?? ""}`)
          .join("; ")
      : null;
    const transactionErrorMessage = Array.isArray(errorData.errors)
      ? (errorData.errors as MPTransactionError[])
          .map(
            (e) =>
              `${e.code ? `[${e.code}] ` : ""}${e.detail ?? e.message ?? ""}`,
          )
          .join("; ")
      : null;
    const errorMessage =
      causeMessage ||
      transactionErrorMessage ||
      errorData.message ||
      errorData.error ||
      response.statusText;
    if (response.status === 402) {
      // Payment-level refusal. The failed provider order and its payment come
      // back in errorData.data; the reason is on the payment, not the order.
      throw new PaymentRejectedError(
        `Mercado Pago API Error: ${errorMessage}`,
        errorData.data?.transactions?.payments?.[0]?.status_detail ?? undefined,
      );
    }
    throw new Error(`Mercado Pago API Error: ${errorMessage}`);
  }
  return response.json();
}

/*
 * Creates a Pix order via Mercado Pago Checkout Transparente Orders API (/v1/orders).
 */
export async function createPixOrder(
  input: CreatePixPaymentInput,
): Promise<CreatePixPaymentResult> {
  if (!MP_ACCESS_TOKEN) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured.");
  }
  const idempotencyHeader = input.idempotencyKey || input.orderId;
  const payer = buildPayer(input);
  const data = await postOrder(
    {
      type: "online",
      external_reference: input.orderId,
      total_amount: input.amount.toFixed(2),
      processing_mode: "automatic",
      payer,
      transactions: {
        payments: [
          {
            amount: input.amount.toFixed(2),
            payment_method: {
              id: "pix",
              type: "bank_transfer",
            },
          },
        ],
      },
    },
    idempotencyHeader,
  );
  const payment = data.transactions?.payments?.[0];
  const paymentMethod = payment?.payment_method;
  if (!data.id || !payment?.id) {
    throw new Error("Mercado Pago API Error: Invalid order response.");
  }
  return {
    paymentId: String(payment.id),
    orderId: String(data.id),
    qrCode: paymentMethod?.qr_code ?? "",
    qrCodeBase64: paymentMethod?.qr_code_base64 ?? "",
    ticketUrl: paymentMethod?.ticket_url ?? undefined,
    status: data.status,
  };
}

/*
 * Creates a card order from a client-generated token. Raw card data never
 * reaches this server. total_amount is the order total: installments never
 * change it, and the amounts shown to the customer come from the provider.
 */
export async function createCardOrder(
  input: CreateCardPaymentInput,
): Promise<CreateCardPaymentResult> {
  if (!MP_ACCESS_TOKEN) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured.");
  }
  if (
    !Number.isInteger(input.installments) ||
    input.installments < 1 ||
    input.installments > MAX_CARD_INSTALLMENTS
  ) {
    throw new Error(
      `Mercado Pago API Error: parcelas devem ser de 1 a ${MAX_CARD_INSTALLMENTS}.`,
    );
  }
  if (!input.token) {
    throw new Error("Mercado Pago API Error: token do cartão é obrigatório.");
  }
  const idempotencyHeader = input.idempotencyKey || input.orderId;
  const payer = buildPayer(input);
  const amount = input.amount.toFixed(2);
  const data = await postOrder(
    {
      type: "online",
      external_reference: input.orderId,
      total_amount: amount,
      processing_mode: "automatic",
      payer,
      transactions: {
        payments: [
          {
            amount,
            payment_method: {
              id: input.paymentMethodId,
              type: input.paymentTypeId,
              token: input.token,
              installments: input.installments,
            },
          },
        ],
      },
    },
    idempotencyHeader,
  );
  const payment = data.transactions?.payments?.[0];
  if (!data.id || !payment?.id) {
    throw new Error("Mercado Pago API Error: Invalid order response.");
  }
  return {
    paymentId: String(payment.id),
    orderId: String(data.id),
    status: String(data.status),
    statusDetail: data.status_detail ?? payment.status_detail ?? undefined,
  };
}

function validateMercadoPagoOrderId(orderId: string): string {
  if (typeof orderId !== "string" || !/^ORD[A-Z0-9]{1,61}$/.test(orderId)) {
    throw new Error("Invalid Mercado Pago order ID.");
  }

  return orderId;
}

/**
 * Fetches order details from Mercado Pago Checkout Transparente Orders API.
 */
export async function getMercadoPagoOrder(
  orderId: string,
): Promise<MercadoPagoOrderDetails | null> {
  if (!MP_ACCESS_TOKEN) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured.");
  }

  const safeOrderId = validateMercadoPagoOrderId(orderId);

  const orderUrl = new URL(
    `/v1/orders/${encodeURIComponent(safeOrderId)}`,
    MP_BASE_URL,
  );

  const response = await fetch(orderUrl, {
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
    },
    redirect: "error",
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch order ${orderId} from Mercado Pago.`);
  }

  const data = await response.json();

  return {
    orderId: String(data.id),
    status: String(data.status),
    status_detail: data.status_detail ?? undefined,
    totalAmount: Number(data.total_amount) || 0,
    totalPaidAmount: Number(data.total_paid_amount) || 0,
    externalReference: data.external_reference ?? undefined,
    payments: Array.isArray(data.transactions?.payments)
      ? data.transactions.payments.map(
          (payment: {
            id: number | string;
            status: string;
            status_detail?: string;
            payment_method?: {
              qr_code?: string;
              qr_code_base64?: string;
              ticket_url?: string;
            };
          }) => ({
            paymentId: String(payment.id),
            status: payment.status,
            statusDetail: payment.status_detail,
            qrCode: payment.payment_method?.qr_code,
            qrCodeBase64: payment.payment_method?.qr_code_base64,
            ticketUrl: payment.payment_method?.ticket_url,
          }),
        )
      : [],
  };
}
