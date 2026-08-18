import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMercadoPagoPayment } from "@/services/mercadopago.service";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago";

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);

    // Extract potential payment IDs from URL query params or request payload
    let dataId = url.searchParams.get("data.id") || url.searchParams.get("id");
    let type = url.searchParams.get("type") || url.searchParams.get("topic");

    // Read payload body if available
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
      if (
        !dataId &&
        body.data &&
        typeof body.data === "object" &&
        "id" in body.data
      ) {
        dataId = String(body.data.id);
      }
      if (!type && body.type) {
        type = String(body.type);
      }
      if (!type && body.action) {
        type = String(body.action);
      }
    } catch {
      // Body reading fails gracefully if request payload is empty
    }

    // Mercado Pago sends webhook test/ping notifications
    if (!dataId) {
      return NextResponse.json(
        { status: "ignored", reason: "No data ID found in webhook" },
        { status: 200 },
      );
    }

    // Optional signature verification if MERCADOPAGO_WEBHOOK_SECRET is configured
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (webhookSecret) {
      const xSignature = request.headers.get("x-signature");
      const xRequestId = request.headers.get("x-request-id");

      const isValidSignature = verifyMercadoPagoSignature({
        xSignatureHeader: xSignature,
        xRequestIdHeader: xRequestId,
        dataId,
        webhookSecret,
      });

      if (!isValidSignature) {
        console.warn(
          `[WEBHOOK_MP] Invalid HMAC signature for dataId: ${dataId}`,
        );
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    }

    // Process payment notifications
    if (
      type === "payment" ||
      type === "payment.updated" ||
      type === "payment.created" ||
      !type
    ) {
      const payment = await getMercadoPagoPayment(dataId);

      if (!payment) {
        console.warn(
          `[WEBHOOK_MP] Payment not found on Mercado Pago for ID: ${dataId}`,
        );
        return NextResponse.json(
          { status: "ok", message: "Payment details not found" },
          { status: 200 },
        );
      }

      const orderId = payment.external_reference;

      // Locate order by external_reference or Mercado Pago payment ID
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            ...(orderId ? [{ id: orderId }] : []),
            { mpPaymentId: String(payment.id) },
          ],
        },
      });

      if (!order) {
        console.warn(
          `[WEBHOOK_MP] Order not found for MP Payment ID ${dataId}`,
        );
        return NextResponse.json(
          { status: "ok", message: "Order not found" },
          { status: 200 },
        );
      }

      // Idempotency check: Skip processing if order is already marked as PAID
      if (order.status === "PAID" && payment.status === "approved") {
        return NextResponse.json(
          { status: "ok", message: "Order already processed" },
          { status: 200 },
        );
      }

      // Handle payment status updates (OrderStatus enum: PENDING, PAID, READY_FOR_PICKUP, COMPLETED, CANCELLED)
      if (payment.status === "approved") {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            mpPaymentId: String(payment.id),
          },
        });
        console.log(`[WEBHOOK_MP] Order ${order.id} marked as PAID`);
      } else if (
        ["cancelled", "rejected", "refunded", "charged_back"].includes(
          payment.status,
        )
      ) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "CANCELLED",
            mpPaymentId: String(payment.id),
          },
        });
        console.log(`[WEBHOOK_MP] Order ${order.id} marked as CANCELLED`);
      }
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("[WEBHOOK_MP_ERROR]", error);
    // Return 200 to acknowledge receipt and prevent unhandled webhook retry loops
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 200 },
    );
  }
}
