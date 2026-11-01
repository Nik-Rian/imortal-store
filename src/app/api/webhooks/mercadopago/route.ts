import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getMercadoPagoOrder,
  MercadoPagoOrderDetails,
  MercadoPagoPaymentDetails,
} from "@/services/mercadopago.service";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago";
import { resolvePaymentSync } from "@/lib/payment-status";
import { revalidatePath } from "next/cache";

const MP_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;
const MAX_SYNC_ATTEMPTS = 3;

type SyncOutcome = "updated" | "unchanged" | "not_found" | "conflict";

async function syncOrderPayment(

  mpOrder: MercadoPagoOrderDetails,

): Promise<SyncOutcome> {

  const payment = mpOrder.payments[0] as
    | MercadoPagoPaymentDetails
    | undefined;
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
    const { count } = await prisma.order.updateMany({
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
    if (count === 0) continue;
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
      const outcome = await syncOrderPayment(mpOrder);
      if (outcome === "conflict") {
        // Non-2xx makes Mercado Pago redeliver; the retry re-reads fresh state.
        return NextResponse.json(
          { error: "Concurrent order update" },
          { status: 409 },
        );
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
