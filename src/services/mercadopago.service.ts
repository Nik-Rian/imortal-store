const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MP_BASE_URL = "https://api.mercadopago.com";

export interface CreatePixPaymentInput {
  orderId: string;
  amount: number;
  email?: string | null;
  description: string;
  firstName?: string;
  lastName?: string;
  cpf?: string;
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
}

export interface MercadoPagoOrderDetails {
  orderId: string;
  status: string;
  externalReference?: string;
  payments: Array<{
    paymentId: string;
    status: string;
  }>;
}

/**
 * Creates a Pix payment via Mercado Pago Payments API (/v1/payments).
 */
export async function createPixPayment(
  input: CreatePixPaymentInput,
): Promise<CreatePixPaymentResult> {
  if (!MP_ACCESS_TOKEN) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured.");
  }

  const response = await fetch(`${MP_BASE_URL}/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "X-Idempotency-Key": input.orderId,
    },
    body: JSON.stringify({
      transaction_amount: input.amount,
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.orderId,
      payer: {
        email: input.email || "cliente@imortalstore.com",
        first_name: input.firstName,
        last_name: input.lastName,
        ...(input.cpf
          ? {
              identification: {
                type: "CPF",
                number: input.cpf,
              },
            }
          : {}),
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Mercado Pago API Error: ${errorData.message || response.statusText}`,
    );
  }

  const data = await response.json();
  const paymentId = String(data.id);
  const orderId = data.order?.id ? String(data.order.id) : undefined;

  const qrCode = data.point_of_interaction?.transaction_data?.qr_code ?? "";
  const qrCodeBase64 =
    data.point_of_interaction?.transaction_data?.qr_code_base64 ?? "";
  const ticketUrl =
    data.point_of_interaction?.transaction_data?.ticket_url ?? undefined;

  return {
    paymentId,
    orderId,
    qrCode,
    qrCodeBase64,
    ticketUrl,
    status: data.status,
  };
}

/**
 * Fetches payment details from Mercado Pago Payments API (/v1/payments/{id}).
 */
export async function getMercadoPagoPayment(
  paymentId: string,
): Promise<MercadoPagoPaymentDetails | null> {
  if (!MP_ACCESS_TOKEN) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured.");
  }

  const response = await fetch(`${MP_BASE_URL}/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch payment ${paymentId} from Mercado Pago.`);
  }

  const data = await response.json();

  return {
    paymentId: String(data.id),
    orderId: data.order?.id ? String(data.order.id) : undefined,
    status: data.status,
    externalReference: data.external_reference ?? undefined,
  };
}

/**
 * Fetches order details from Mercado Pago Merchant Orders API (/merchant_orders/{id}).
 */
export async function getMercadoPagoOrder(
  orderId: string,
): Promise<MercadoPagoOrderDetails | null> {
  if (!MP_ACCESS_TOKEN) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured.");
  }

  const response = await fetch(`${MP_BASE_URL}/merchant_orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(
      `Failed to fetch merchant order ${orderId} from Mercado Pago.`,
    );
  }

  const data = await response.json();

  return {
    orderId: String(data.id),
    status: data.status,
    externalReference: data.external_reference ?? undefined,
    payments: Array.isArray(data.payments)
      ? data.payments.map((p: { id: number | string; status: string }) => ({
          paymentId: String(p.id),
          status: p.status,
        }))
      : [],
  };
}
