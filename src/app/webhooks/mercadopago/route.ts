import { NextRequest, NextResponse } from "next/server";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago";
import { getMercadoPagoPayment } from "@/services/mercadopago.service";
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

    // Ignore non-payment events with a 200 acknowledgment
    if (type !== "payment" && !body?.action?.startsWith("payment.")) {
      return NextResponse.json({ message: "Event ignored" }, { status: 200 });
    }

    if (!dataId) {
      return NextResponse.json(
        { error: "Missing payment ID" },
        { status: 400 },
      );
    }

    // Authoritative check against Mercado Pago API
    const payment = await getMercadoPagoPayment(dataId);

    // Idempotent update: process payment approval and transition status
    if (payment.status === "approved" && payment.external_reference) {
      await prisma.order.updateMany({
        where: {
          id: payment.external_reference,
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
