const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MP_BASE_URL = "https://api.mercadopago.com";
import { inspect } from "node:util";

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
  const cleanedCpf = input.cpf.replace(/\D/g, "");

  if (cleanedCpf.length !== 11) {
    throw new Error("Mercado Pago API Error: CPF do pagador é inválido.");
  }

    const trimmedEmail = input.email?.trim();
    if (!trimmedEmail) {
      throw new Error(
        "Mercado Pago API Error: E-mail do cliente é obrigatório.",
      );
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

  const response = await fetch(`${MP_BASE_URL}/v1/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "X-Idempotency-Key": idempotencyHeader,
    },
    body: JSON.stringify({
      type: "online",
      external_reference: input.orderId,
      total_amount: input.amount.toFixed(2),
      processing_mode: "automatic",
      payer: {
        email: trimmedEmail,
        ...(input.firstName?.trim() ? { first_name: input.firstName.trim() } : {}),
        ...(input.lastName?.trim() ? { last_name: input.lastName.trim() } : {}),
        identification: {
          type: "CPF",
          number: cleanedCpf,
        },
        ...phonePayload,
      },
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
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    // util.inspect avoids Node's default console depth limit, which was
    // hiding nested arrays/objects as "[Object]" in prior logs.
    console.error(
      "Mercado Pago /v1/orders rejected request:",
      response.status,
      inspect(errorData, { depth: null }),
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

    throw new Error(`Mercado Pago API Error: ${errorMessage}`);
  }

  const data = await response.json();
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

/**
 * Fetches order details from Mercado Pago Checkout Transparente Orders API.
 */
export async function getMercadoPagoOrder(
  orderId: string,
): Promise<MercadoPagoOrderDetails | null> {
  if (!MP_ACCESS_TOKEN) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured.");
  }

  const response = await fetch(`${MP_BASE_URL}/v1/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch order ${orderId} from Mercado Pago.`);
  }

  const data = await response.json();

  return {
    orderId: String(data.id),
    status: String(data.status),
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
