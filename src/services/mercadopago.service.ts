import { randomUUID } from "node:crypto";

export interface MercadoPagoOrderResponse {
  id: string;
  status: string;
  external_reference: string | null;
  total_amount: string;
  transactions?: {
    payments?: Array<{
      id: string;
      status: string;
      status_detail?: string;
      payment_method?: {
        id: string;
        type: string;
        ticket_url?: string;
        qr_code?: string;
        qr_code_base64?: string;
      };
    }>;
  };
}

export interface CreatePixPaymentParams {
  amount: number;
  description: string;
  orderId: string;
  email: string;
  cpf?: string;
  firstName?: string;
  lastName?: string;
}

export interface PixPaymentResult {
  id: string;
  status: string;
  statusDetail: string;
  externalReference: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
}

export async function getMercadoPagoOrder(
  orderId: string,
): Promise<MercadoPagoOrderResponse | null> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN environment variable is not set");
  }

  const response = await fetch(
    `https://api.mercadopago.com/v1/orders/${orderId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Mercado Pago API error for order ${orderId}: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as MercadoPagoOrderResponse;
}

export async function createPixPayment(
  params: CreatePixPaymentParams,
): Promise<PixPaymentResult> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN environment variable is not set");
  }

  const formattedAmount = params.amount.toFixed(2);
  const cleanCpf = params.cpf ? params.cpf.replace(/\D/g, "") : undefined;

  const payload = {
    type: "online",
    total_amount: formattedAmount,
    external_reference: params.orderId,
    processing_mode: "automatic",
    transactions: {
      payments: [
        {
          amount: formattedAmount,
          payment_method: {
            id: "pix",
            type: "bank_transfer",
          },
        },
      ],
    },
    payer: {
      email: params.email,
      ...(params.firstName ? { first_name: params.firstName } : {}),
      ...(params.lastName ? { last_name: params.lastName } : {}),
      ...(cleanCpf
        ? {
            identification: {
              type: "CPF",
              number: cleanCpf,
            },
          }
        : {}),
    },
  };

  const response = await fetch("https://api.mercadopago.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    // Extract precise error causes returned by Mercado Pago
    const causeMessages = Array.isArray(data?.cause)
      ? data.cause
          .map(
            (c: { description?: string; code?: string | number }) =>
              c.description || `Code ${c.code}`,
          )
          .join(" | ")
      : null;

    const errorDetails =
      causeMessages ||
      data?.message ||
      data?.error ||
      `Mercado Pago API error (${response.status}): ${response.statusText}`;

    throw new Error(errorDetails);
  }

  const paymentMethod = data.transactions?.payments?.[0]?.payment_method;

  if (!paymentMethod?.qr_code || !paymentMethod?.qr_code_base64) {
    throw new Error("Mercado Pago API returned incomplete Pix payload.");
  }

  return {
    id: data.id,
    status: data.status,
    statusDetail: data.status_detail ?? data.status,
    externalReference: data.external_reference,
    qrCode: paymentMethod.qr_code,
    qrCodeBase64: paymentMethod.qr_code_base64,
    ticketUrl: paymentMethod.ticket_url ?? "",
  };
}

export async function getMercadoPagoPayment(paymentId: string) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("MERCADOPAGO_ACCESS_TOKEN is not set");

  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`Mercado Pago API error: ${response.status}`);

  return response.json();
}
