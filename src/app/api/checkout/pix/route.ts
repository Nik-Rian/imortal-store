import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPixPayment } from "@/services/mercadopago.service";
import { randomUUID } from "node:crypto";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 },
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Prevent creation if order is already paid
    if (order.status === "PAID") {
      return NextResponse.json({
        success: true,
        message: "Order is already paid",
        paymentId: order.mpPaymentId,
      });
    }

    // Return existing Pix payment data if attempt already generated QR code
    if (order.status === "PENDING" && order.pixQrCode && order.mpPaymentId) {
      return NextResponse.json({
        success: true,
        paymentId: order.mpPaymentId,
        orderId: order.mpOrderId,
        pixQrCode: order.pixQrCode,
        pixQrCodeBase64: order.pixQrCodeBase64,
      });
    }

    // Reuse existing attempt idempotency key or persist a new UUID
    let idempotencyKey = order.idempotencyKey;
    if (!idempotencyKey) {
      idempotencyKey = randomUUID();
      await prisma.order.update({
        where: { id: order.id },
        data: { idempotencyKey },
      });
    }

    // Create Pix payment with Mercado Pago using per-attempt key
    const paymentResult = await createPixPayment({
      orderId: order.id,
      amount: order.totalPriceCents / 100,
      email: order.customerEmail,
      description: `Order #${order.id}`,
      firstName: order.customerName.split(" ")[0],
      lastName: order.customerName.split(" ").slice(1).join(" ") || undefined,
      idempotencyKey,
    });

    // Store payment response details on order
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
