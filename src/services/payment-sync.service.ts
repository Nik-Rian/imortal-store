import type { PaymentStatus } from "@/generated/prisma/client";
import {
  resolvePaymentSync,
  type PaymentSyncDecision,
} from "@/lib/payment-status";
import { prisma } from "@/lib/prisma";
import type {
  MercadoPagoOrderDetails,
  MercadoPagoPaymentDetails,
} from "@/services/mercadopago.service";
import {
  finalizeReservations,
  releaseReservations,
  type StockTransactionClient,
} from "@/services/stock.service";
import { revalidatePath } from "next/cache";

const MAX_SYNC_ATTEMPTS = 3;

export type SyncOutcome = "updated" | "unchanged" | "not_found" | "conflict";

export type AbandonOutcome = "abandoned" | "conflict";

/**
 * Stock follows provider-confirmed outcomes only. Each branch touches only
 * reservations still RESERVED, so a replayed or out-of-order notification
 * cannot change stock twice. Refunds, chargebacks and reviews never reach
 * stock: returned goods are restored manually through the stock editor.
 * Runs inside the transaction of the compare-and-set, so a failure here rolls
 * the order update back and the provider redelivers the notification.
 */
async function applyStockEffect(
  tx: StockTransactionClient,
  orderId: string,
  previousPaymentStatus: PaymentStatus,
  decision: PaymentSyncDecision,
): Promise<void> {
  if (decision.paymentStatus === previousPaymentStatus) return;

  switch (decision.paymentStatus) {
    case "PAID":
      // Payment on an already canceled order is a late payment: it stays
      // flagged for administrative resolution and is never honored silently.
      if (decision.fulfillmentStatus === "CANCELED") return;
      await finalizeReservations(tx, orderId);
      return;
    case "FAILED":
    case "EXPIRED":
    case "CANCELED":
      await releaseReservations(tx, orderId);
      return;
    default:
      return;
  }
}

export async function syncOrderPayment(
  mpOrder: MercadoPagoOrderDetails,
): Promise<SyncOutcome> {
  const payment = mpOrder.payments[0] as MercadoPagoPaymentDetails | undefined;
  const mpStatusDetail = mpOrder.status_detail || payment?.statusDetail;
  const providerTotalCents = Math.round(mpOrder.totalAmount * 100);
  const providerPaidCents = Math.round(mpOrder.totalPaidAmount * 100);

  for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { mpOrderId: mpOrder.orderId },
          ...(mpOrder.externalReference
            ? [{ id: mpOrder.externalReference }]
            : []),
        ],
      },
    });
    if (!order) return "not_found";
    const decision = resolvePaymentSync({
      order,
      providerStatus: mpOrder.status,
      providerStatusDetail: mpStatusDetail,
      providerTotalCents,
      providerPaidCents,
    });

    if (!decision.apply) return "unchanged";
    const applied = await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: {
          id: order.id,
          paymentStatus: order.paymentStatus,
          status: order.status,
        },
        data: {
          mpOrderId: mpOrder.orderId,
          paymentStatus: decision.paymentStatus,
          status: decision.fulfillmentStatus,
          paymentReviewReason: decision.reviewReason,
          providerStatus: mpOrder.status,
          providerStatusDetail: payment?.statusDetail || mpStatusDetail || null,
          paidAmount: providerPaidCents,
          lastPaymentSync: new Date(),
          ...(payment?.paymentId ? { mpPaymentId: payment.paymentId } : {}),
          ...(payment?.qrCode
            ? {
                pixQrCode: payment.qrCode,
                pixQrCodeBase64: payment.qrCodeBase64 ?? null,
              }
            : {}),
        },
      });

      if (count === 0) return false;

      await applyStockEffect(tx, order.id, order.paymentStatus, decision);

      return true;
    });

    if (!applied) continue;

    if (
      decision.reviewReason &&
      decision.reviewReason !== order.paymentReviewReason
    ) {
      console.warn("Mercado Pago Webhook: order flagged for manual review", {
        orderId: order.id,
        mpOrderId: mpOrder.orderId,
        reason: decision.reviewReason,
        providerStatus: mpOrder.status,
        providerTotalCents,
        providerPaidCents,
        localTotalCents: order.totalPriceCents,
      });
    }

    revalidatePath(`/pedidos/${order.accessToken}`);
    revalidatePath("/admin/pedidos");
    return "updated";
  }
  return "conflict";
}

/**
 * Cancels an order that never received a provider record and releases its
 * reservations. The caller must already have proven that the provider holds no
 * order for it. The compare-and-set requires the order to be untouched (no
 * provider id, payment and fulfilment still PENDING), so a webhook that links
 * a provider order first, or an order already being prepared, wins. A payment
 * that appears later is handled by the normal sync as a flagged late payment.
 */
export async function abandonUnpaidOrder(order: {
  id: string;
  accessToken: string;
}): Promise<AbandonOutcome> {
  const abandoned = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: {
        id: order.id,
        paymentStatus: "PENDING",
        status: "PENDING",
        mpOrderId: null,
      },
      data: {
        paymentStatus: "FAILED",
        status: "CANCELED",
        lastPaymentSync: new Date(),
      },
    });

    if (count === 0) return false;

    await releaseReservations(tx, order.id);

    return true;
  });

  if (!abandoned) return "conflict";

  revalidatePath(`/pedidos/${order.accessToken}`);
  revalidatePath("/admin/pedidos");
  return "abandoned";
}
