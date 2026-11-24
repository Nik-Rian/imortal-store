import { verifyMercadoPagoSignature } from "@/lib/mercadopago";
import {
  getMercadoPagoOrder,
  isMercadoPagoOrderId,
} from "@/services/mercadopago.service";
import { syncOrderPayment } from "@/services/payment-sync.service";
import { NextResponse } from "next/server";

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
      const orderResourceId = String(resourceId);

      if (!isMercadoPagoOrderId(orderResourceId)) {
        // Identifiers such as a chargeback id cannot be fetched as orders. A
        // non-2xx answer would only make the provider redeliver the same notice.
        console.warn(
          "Mercado Pago Webhook: ignoring notification with a non-order resource id",
          { topic, resourceId: orderResourceId },
        );
        return NextResponse.json({ received: true, ignored: true });
      }
      const mpOrder = await getMercadoPagoOrder(orderResourceId);

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
