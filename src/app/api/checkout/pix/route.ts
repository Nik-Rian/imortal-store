import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPixPayment } from "@/services/mercadopago.service";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId } = body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const paymentResult = await createPixPayment({
      orderId: order.id,
      amount: order.totalPriceCents / 100,
      email: order.customerEmail,
      description: `Order #${order.id}`,
      firstName: order.customerName.split(" ")[0],
      lastName: order.customerName.split(" ").slice(1).join(" ") || undefined,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        mpPaymentId: paymentResult.paymentId,
        mpOrderId: paymentResult.orderId,
        pixQrCode: paymentResult.qrCode,
        pixQrCodeBase64: paymentResult.qrCodeBase64,
      },
    });

    return NextResponse.json({
      success: true,
      paymentId: paymentResult.paymentId,
      orderId: paymentResult.orderId,
      pixQrCode: paymentResult.qrCode,
      pixQrCodeBase64: paymentResult.qrCodeBase64,
      ticketUrl: paymentResult.ticketUrl,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to process Pix payment";
    console.error("Pix Checkout Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
