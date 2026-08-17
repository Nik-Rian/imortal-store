import { randomUUID } from "node:crypto";

export interface MercadoPagoPaymentResponse {
  id: number;
  status: string;
  status_detail: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
  date_approved: string | null;
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
  id: number;
  status: string;
  statusDetail: string;
  externalReference: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
}

/**
 * Fetches payment details from the Mercado Pago v1 payments endpoint.
 */
export async function getMercadoPagoPayment(
  paymentId: string | number,
): Promise<MercadoPagoPaymentResponse | null> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN environment variable is not set");
  }

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

  // Retorna null caso o ID seja fictício (404)
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Mercado Pago API error for payment ${paymentId}: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as MercadoPagoPaymentResponse;
}

/**
 * Generates a dynamic Pix payment via Mercado Pago API v1.
 */
export async function createPixPayment(
  params: CreatePixPaymentParams,
): Promise<PixPaymentResult> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN environment variable is not set");
  }

  const cleanCpf = params.cpf ? params.cpf.replace(/\D/g, "") : undefined;

  const payload = {
    transaction_amount: Number(params.amount.toFixed(2)),
    description: params.description,
    payment_method_id: "pix",
    external_reference: params.orderId,
    payer: {
      email: params.email,
      first_name: params.firstName,
      last_name: params.lastName,
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
  const response = await fetch("https://api.mercadopago.com/v1/payments", {
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
    const causes = Array.isArray(data?.cause)
      ? data.cause
          .map(
            (c: { description?: string; code?: number | string }) =>
              c.description || c.code,
          )
          .filter(Boolean)
          .join(" | ")
      : null;

    console.error("Mercado Pago Raw Response:", JSON.stringify(data, null, 2));
    const errorMessage =
      causes ||
      data?.message ||
      `Mercado Pago API error (${response.status}): ${response.statusText}`;

    throw new Error(errorMessage);
  }

  const transactionData = data?.point_of_interaction?.transaction_data;

  if (!transactionData?.qr_code || !transactionData?.qr_code_base64) {
    throw new Error("Mercado Pago API returned incomplete Pix payload.");
  }

  return {
    id: data.id,
    status: data.status,
    statusDetail: data.status_detail,
    externalReference: data.external_reference ?? params.orderId,
    qrCode: transactionData.qr_code,
    qrCodeBase64: transactionData.qr_code_base64,
    ticketUrl: transactionData.ticket_url ?? "",
  };
}
