import { NextRequest, NextResponse } from "next/server";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago";
import { getMercadoPagoOrder } from "@/services/mercadopago.service";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const xSignature = req.headers.get("x-signature");
    const xRequestId = req.headers.get("x-request-id");

    const body = await req.json().catch(() => ({}));
    const searchParams = req.nextUrl.searchParams;

    const dataId =
      body?.data?.id || searchParams.get("id") || searchParams.get("data.id");
    const type =
      body?.type || searchParams.get("topic") || searchParams.get("type");

    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("MERCADOPAGO_WEBHOOK_SECRET is not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const isValidSignature = verifyMercadoPagoSignature({
      xSignatureHeader: xSignature,
      xRequestIdHeader: xRequestId,
      dataId: dataId ? String(dataId) : null,
      webhookSecret,
    });

    if (!isValidSignature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Accept order and payment events during transition
    const isOrderEvent =
      type === "order" ||
      body?.action?.startsWith("order.") ||
      type === "merchant_order";

    const isPaymentEvent =
      type === "payment" || body?.action?.startsWith("payment.");

    if (!isOrderEvent && !isPaymentEvent) {
      return NextResponse.json({ message: "Event ignored" }, { status: 200 });
    }

    if (!dataId) {
      return NextResponse.json({ error: "Missing entity ID" }, { status: 400 });
    }

    const order = await getMercadoPagoOrder(dataId);

    if (!order) {
      return NextResponse.json(
        { message: "Order not found or test event ignored" },
        { status: 200 },
      );
    }

    // Check if order is processed or if underlying transaction is approved
    const isApproved =
      order.status === "processed" ||
      order.transactions?.payments?.some((p) => p.status === "approved");

    if (isApproved && order.external_reference) {
      await prisma.order.updateMany({
        where: {
          id: order.external_reference,
          status: { not: "PAID" },
        },
        data: {
          status: "PAID",
        },
      });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Mercado Pago Webhook Error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }
}
