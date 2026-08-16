export interface MercadoPagoPaymentResponse {
  id: number;
  status: string;
  status_detail: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
  date_approved: string | null;
}

/**
 * Fetches payment details from the Mercado Pago v1 payments endpoint.
 */
export async function getMercadoPagoPayment(
  paymentId: string | number,
): Promise<MercadoPagoPaymentResponse> {
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

  if (!response.ok) {
    throw new Error(
      `Mercado Pago API error for payment ${paymentId}: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as MercadoPagoPaymentResponse;
}
