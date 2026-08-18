export interface PixPaymentData {
  amount: number;
  description: string;
  orderId: string;
  email: string;
  cpf?: string;
  firstName?: string;
  lastName?: string;
}

export type CreatePixParams = PixPaymentData;

export interface PixPaymentResult {
  id: string;
  status: string;
  statusDetail?: string;
  externalReference?: string;
  qrCode: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
}

export interface MercadoPagoPaymentDetail {
  id: number;
  status: string;
  status_detail: string;
  external_reference: string | null;
  transaction_amount: number;
}

/**
 * Creates a Pix charge in Mercado Pago using the Orders API (v1/orders).
 */
export async function createPixPayment(
  data: PixPaymentData,
): Promise<PixPaymentResult> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não está configurado.");
  }

  const body = {
    type: "online",
    processing_mode: "automatic",
    external_reference: data.orderId,
    description: data.description,
    total_amount: data.amount,
    transactions: {
      payments: [
        {
          amount: data.amount,
          payment_method: {
            id: "pix",
            type: "bank_transfer",
          },
        },
      ],
    },
    payer: {
      email: data.email,
      first_name: data.firstName || "Cliente",
      last_name: data.lastName || "Imortal",
      ...(data.cpf
        ? {
            identification: {
              type: "CPF",
              number: data.cpf.replace(/\D/g, ""),
            },
          }
        : {}),
    },
  };

  const response = await fetch("https://api.mercadopago.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Idempotency-Key": `${data.orderId}-${Date.now()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Erro Mercado Pago Orders API:", errorData);
    throw new Error(
      `Falha ao criar pagamento Pix: ${
        errorData.message || response.statusText
      }`,
    );
  }

  const responseData = await response.json();

  const payment = responseData.transactions?.payments?.[0];
  const paymentMethod = payment?.payment_method;

  return {
    id: payment?.id ? String(payment.id) : String(responseData.id ?? ""),
    status: payment?.status ?? responseData.status ?? "pending",
    statusDetail: payment?.status_detail,
    externalReference: responseData.external_reference,
    qrCode: paymentMethod?.qr_code ?? "",
    qrCodeBase64: paymentMethod?.qr_code_base64 ?? "",
    ticketUrl: paymentMethod?.ticket_url ?? "",
  };
}

/**
 * Retrieves payment details from Mercado Pago using the payment ID.
 */
export async function getMercadoPagoPayment(
  paymentId: string,
): Promise<MercadoPagoPaymentDetail | null> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado no ambiente.");
  }

  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  if (response.status === 404) return null;

  if (!response.ok) {
    console.error(
      `Erro ao buscar pagamento MP ID ${paymentId}:`,
      response.statusText,
    );
    return null;
  }

  return response.json();
}
