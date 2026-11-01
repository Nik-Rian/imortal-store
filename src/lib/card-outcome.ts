/**
 * Customer-facing handling of card payment failures. Pure, so the server
 * action and the order page share the same messages.
 */

/** Thrown when the provider answers HTTP 402: the payment itself was refused. */
export class PaymentRejectedError extends Error {
  readonly statusDetail?: string;

  constructor(message: string, statusDetail?: string) {
    super(message);
    this.name = "PaymentRejectedError";
    this.statusDetail = statusDetail;
  }
}

const DEFAULT_FAILURE_MESSAGE =
  "Não foi possível aprovar o pagamento com cartão. Tente outro cartão ou pague com Pix.";

// Keys are Mercado Pago payment-level status_detail values.
const FAILURE_MESSAGES: Record<string, string> = {
  rejected_by_issuer:
    "O banco emissor recusou o pagamento. Tente outro cartão ou entre em contato com o seu banco.",
  required_call_for_authorize:
    "Seu banco precisa autorizar esta compra. Entre em contato com ele ou use outro cartão.",
  card_insufficient_amount:
    "Saldo ou limite insuficiente no cartão. Tente outro cartão.",
  amount_limit_exceeded:
    "O valor da compra excede o limite do cartão. Tente outro cartão.",
  card_disabled: "Este cartão está desabilitado. Use outro cartão.",
  bad_filled_card_data: "Confira os dados do cartão e tente novamente.",
  invalid_card_token:
    "Não foi possível validar os dados do cartão. Digite os dados novamente.",
  invalid_installments:
    "Este cartão não aceita o parcelamento escolhido. Tente outro número de parcelas.",
  high_risk:
    "O pagamento não foi autorizado por segurança. Tente outro cartão ou pague com Pix.",
  max_attempts_exceeded:
    "Limite de tentativas excedido. Aguarde alguns minutos, use outro cartão ou pague com Pix.",
  processing_error:
    "Erro temporário ao processar o pagamento. Tente novamente em instantes.",
};

export function describeCardFailure(statusDetail?: string | null): string {
  if (statusDetail && Object.hasOwn(FAILURE_MESSAGES, statusDetail)) {
    return FAILURE_MESSAGES[statusDetail];
  }
  return DEFAULT_FAILURE_MESSAGE;
}
