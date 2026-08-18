interface CreatePixParams {
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
* Creates a Pix charge in Mercado Pago using the Payments API (v1/payments).
*/
export async function createPixPayment(
  params: CreatePixParams,
): Promise<PixPaymentResult> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado no ambiente.");
  }

  const cleanCpf = params.cpf ? params.cpf.replace(/\D/g, "") : undefined;

  const payload = {
    transaction_amount: params.amount,
    description: params.description,
    payment_method_id: "pix",
    external_reference: params.orderId,
    payer: {
      email: params.email,
      first_name: params.firstName || "Cliente",
      last_name: params.lastName || "Imortal",
      ...(cleanCpf && cleanCpf.length === 11
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
      "X-Idempotency-Key": `order-pix-${params.orderId}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Erro da API Mercado Pago ao criar Pix:", data);
    throw new Error(
      `Falha na integração com o Mercado Pago: ${data.message || response.statusText}`,
    );
  }

  const paymentMethod = data.point_of_interaction?.transaction_data;

  return {
    id: String(data.id),
    status: data.status,
    statusDetail: data.status_detail,
    externalReference: data.external_reference,
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
    console.error(`Erro ao buscar pagamento MP ID ${paymentId}:`, response.statusText);
    return null;
  }

  return response.json();
}
