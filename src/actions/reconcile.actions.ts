"use server";

import { requireSession } from "@/lib/auth-guard";
import { reconcileStalePayments } from "@/services/reconciliation.service";
import { revalidatePath } from "next/cache";

const RECONCILIATION_FAILURE_MESSAGE =
  "Não foi possível reconciliar os pagamentos agora. Tente novamente em instantes.";

/**
 * Runs one reconciliation batch on demand and returns its summary.
 */
export async function reconcileStalePaymentsAction() {
  await requireSession();

  try {
    const summary = await reconcileStalePayments();
    revalidatePath("/admin/pedidos");
    return { success: true as const, summary };
  } catch (error) {
    console.error("Payment reconciliation failed:", error);
    return { success: false as const, error: RECONCILIATION_FAILURE_MESSAGE };
  }
}
