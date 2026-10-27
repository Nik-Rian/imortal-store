import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/generated/prisma/client";
import {
  getMercadoPagoOrder,
  MercadoPagoPaymentDetails,
} from "@/services/mercadopago.service";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago";

const MP_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;

export function determineNextOrderStatus(
  currentStatus: OrderStatus,
  mpStatus: string,
  mpTotalAmount: number,
  localTotalPriceCents: number,
  orderId: string,
): OrderStatus {
  if (mpStatus === "processed") {
    if (currentStatus === "PENDING") {
      const mpAmountCents = Math.round(mpTotalAmount * 100);
      if (mpAmountCents !== localTotalPriceCents) {
        console.error(
          `Webhook amount mismatch for order ${orderId}: provider amount ${mpAmountCents} cents, local amount ${localTotalPriceCents} cents.`,
        );
        return currentStatus;
      }
      return "PAID";
    }
    if (currentStatus === "CANCELED") {
      console.warn(
        `Manual review required: Received 'processed' webhook for already CANCELED order ${orderId}`,
      );
    }
    return currentStatus; // Forward-only: preserves READY_FOR_PICKUP, COMPLETED, CANCELED
  }

  if (["failed", "canceled", "cancelled", "expired"].includes(mpStatus)) {
    if (currentStatus === "PENDING") {
      return "CANCELED";
    }
    return currentStatus;
  }

  // Handle chargebacks and refunds
  if (["charged_back", "refunded"].includes(mpStatus)) {
    if (["PAID", "READY_FOR_PICKUP", "PENDING"].includes(currentStatus)) {
      console.warn(
        `Order ${orderId} received status ${mpStatus}. Canceling order.`,
      );
      return "CANCELED";
    }
  }

  return currentStatus;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    const topic =
      url.searchParams.get("topic") ||
      url.searchParams.get("type") ||
      body.type ||
      body.action;

    const resourceId =
      url.searchParams.get("data.id") ||
      url.searchParams.get("id") ||
      body.data?.id;

    if (!resourceId) {
      return NextResponse.json({ received: true });
    }

    const isValid = verifyMercadoPagoSignature({
      xSignatureHeader: req.headers.get("x-signature"),
      xRequestIdHeader: req.headers.get("x-request-id"),
      dataId: String(resourceId),
      webhookSecret: MP_WEBHOOK_SECRET ?? "",
    });

    if (!isValid) {
      console.warn("Mercado Pago Webhook: invalid signature", {
        topic,
        resourceId,
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Process order logic
    const isOrderEvent =
      topic === "order" ||
      topic === "chargebacks" ||
      topic === "order.charged_back" ||
      body.action === "order.charged_back";

    if (isOrderEvent) {
      const mpOrder = await getMercadoPagoOrder(String(resourceId));

      if (!mpOrder) {
        return NextResponse.json({ received: true });
      }

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

      if (order) {
        const payment = mpOrder.payments[0] as
          | MercadoPagoPaymentDetails
          | undefined;

        const newStatus = determineNextOrderStatus(
          order.status,
          mpOrder.status,
          mpOrder.totalAmount,
          order.totalPriceCents,
          order.id,
        );

        const shouldUpdateStatus = newStatus !== order.status;
        const shouldUpdatePayment =
          payment?.paymentId && payment.paymentId !== order.mpPaymentId;

        if (shouldUpdateStatus || shouldUpdatePayment) {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              mpOrderId: mpOrder.orderId,
              ...(payment?.paymentId ? { mpPaymentId: payment.paymentId } : {}),
              ...(payment?.qrCode
                ? {
                    pixQrCode: payment.qrCode,
                    pixQrCodeBase64: payment.qrCodeBase64 ?? null,
                  }
                : {}),
              status: newStatus,
            },
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Mercado Pago Webhook Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
