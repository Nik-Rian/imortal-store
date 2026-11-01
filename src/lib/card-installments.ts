import { MAX_CARD_INSTALLMENTS } from "@/lib/validations/checkout.schema";

/** The subset of the provider's payer_costs entry that we use. */
export interface PayerCostLike {
  installments: number | string;
  recommended_message?: string | null;
}

export interface InstallmentOption {
  installments: number;
  label: string;
}

/**
 * Keeps only whole-number options from 1 to `max`, drops duplicates, and uses
 * the provider's own message as the label so the amounts shown come from
 * Mercado Pago, not from us.
 */
export function capInstallments(
  payerCosts: readonly PayerCostLike[] | null | undefined,
  max: number = MAX_CARD_INSTALLMENTS,
): InstallmentOption[] {
  const seen = new Set<number>();
  const options: InstallmentOption[] = [];
  for (const cost of payerCosts ?? []) {
    const installments = Number(cost.installments);
    if (
      !Number.isInteger(installments) ||
      installments < 1 ||
      installments > max ||
      seen.has(installments)
    ) {
      continue;
    }
    seen.add(installments);
    options.push({
      installments,
      label: cost.recommended_message?.trim() || `${installments}x`,
    });
  }
  return options.sort((a, b) => a.installments - b.installments);
}
