import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getMercadoPagoOrder,
  MercadoPagoPaymentDetails,
} from "@/services/mercadopago.service";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago";
import {
  mapPaymentStatus,
  resolveFulfillmentStatus,
} from "@/lib/payment-status";
import { revalidatePath } from "next/cache";

const MP_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;

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
      //console.log("MP Order Payload:", JSON.stringify(mpOrder, null, 2));

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
        const mpStatus = mpOrder.status;
        const mpStatusDetail = mpOrder.status_detail || payment?.statusDetail;
        const newPaymentStatus = mapPaymentStatus(mpStatus, mpStatusDetail);
        const newFulfillmentStatus = resolveFulfillmentStatus(
          order.status,
          newPaymentStatus,
        );
        const newPaidAmount = Math.round(mpOrder.totalPaidAmount * 100);

        const hasVisibleChange =
          newPaymentStatus !== order.paymentStatus ||
          newFulfillmentStatus !== order.status ||
          newPaidAmount !== order.paidAmount;

        await prisma.order.update({
          where: { id: order.id },
          data: {
            mpOrderId: mpOrder.orderId,
            paymentStatus: newPaymentStatus,
            ...(newFulfillmentStatus !== order.status
              ? { status: newFulfillmentStatus }
              : {}),
            providerStatus: mpStatus,
            providerStatusDetail: mpStatusDetail || null,
            paidAmount: newPaidAmount,
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

        if (hasVisibleChange) {
          revalidatePath(`/pedidos/${order.accessToken}`);
          revalidatePath("/admin/pedidos");
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
