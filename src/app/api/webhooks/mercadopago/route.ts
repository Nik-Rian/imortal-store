import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getMercadoPagoPayment,
  getMercadoPagoOrder,
} from "@/services/mercadopago.service";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    const topic =
      url.searchParams.get("topic") ||
      url.searchParams.get("type") ||
      body.type ||
      body.action;

    const resourceId = url.searchParams.get("id") || body.data?.id;

    if (!resourceId) {
      return NextResponse.json({ received: true });
    }

    // Process Payment Notifications (/v1/payments)
    if (topic === "payment" || topic?.startsWith("payment.")) {
      const payment = await getMercadoPagoPayment(String(resourceId));
      if (!payment) return NextResponse.json({ received: true });

      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { mpPaymentId: payment.paymentId },
            ...(payment.externalReference
              ? [{ id: payment.externalReference }]
              : []),
          ],
        },
      });

      if (order) {
        let newStatus = order.status;
        if (payment.status === "approved") {
          newStatus = "PAID";
        } else if (
          payment.status === "canceled" ||
          payment.status === "rejected"
        ) {
          newStatus = "CANCELED";
        }

        await prisma.order.update({
          where: { id: order.id },
          data: {
            mpPaymentId: payment.paymentId,
            ...(payment.orderId ? { mpOrderId: payment.orderId } : {}),
            status: newStatus,
          },
        });
      }
    }

    // Process Merchant Order Notifications (/merchant_orders)
    if (topic === "merchant_order" || topic === "order") {
      const merchantOrder = await getMercadoPagoOrder(String(resourceId));
      if (!merchantOrder) return NextResponse.json({ received: true });

      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { mpOrderId: merchantOrder.orderId },
            ...(merchantOrder.externalReference
              ? [{ id: merchantOrder.externalReference }]
              : []),
          ],
        },
      });

      if (order) {
        const hasApprovedPayment = merchantOrder.payments.some(
          (p) => p.status === "approved",
        );

        await prisma.order.update({
          where: { id: order.id },
          data: {
            mpOrderId: merchantOrder.orderId,
            ...(hasApprovedPayment ? { status: "PAID" } : {}),
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
