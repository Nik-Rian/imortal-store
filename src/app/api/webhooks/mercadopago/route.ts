import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMercadoPagoOrder } from "@/services/mercadopago.service";
import { MercadoPagoPaymentDetails } from "@/services/mercadopago.service";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago";

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

    // Verify x-signature HMAC before trusting the notification.
    // MP's own reference implementations lowercase data.id in the manifest.
    const isValid = verifyMercadoPagoSignature({
      xSignatureHeader: req.headers.get("x-signature"),
      xRequestIdHeader: req.headers.get("x-request-id"),
      dataId: String(resourceId).toLowerCase(),
      webhookSecret: MP_WEBHOOK_SECRET ?? "",
    });

    console.log("DEBUG webhook", {
      xSignature: req.headers.get("x-signature"),
      xRequestId: req.headers.get("x-request-id"),
      resourceId,
      dataIdLower: String(resourceId).toLowerCase(),
      secretPresent: !!MP_WEBHOOK_SECRET,
      secretPreview:
        MP_WEBHOOK_SECRET?.slice(0, 4) + "..." + MP_WEBHOOK_SECRET?.slice(-4),
      secretLength: MP_WEBHOOK_SECRET?.length,
    });

    if (!isValid) {
      console.warn("Mercado Pago Webhook: invalid signature", {
        topic,
        resourceId,
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    if (topic === "order") {
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

        const newStatus =
          mpOrder.status === "processed"
            ? "PAID"
            : mpOrder.status === "failed" || mpOrder.status === "canceled"
              ? "CANCELED"
              : order.status;

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

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Mercado Pago Webhook Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
