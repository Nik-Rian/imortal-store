import { NextResponse } from "next/server";
import { getMercadoPagoPayment } from "@/services/mercadopago.service";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    // MP sends data via query string or body.
    const type =
      body.type ||
      body.topic ||
      url.searchParams.get("type") ||
      url.searchParams.get("topic");
    const dataId =
      body.data?.id ||
      url.searchParams.get("data.id") ||
      url.searchParams.get("id");

    if (!dataId) {
      return NextResponse.json(
        { message: "Evento sem ID ignorado." },
        { status: 200 },
      );
    }

    // Processing for Payment-type notifications
    if (type === "payment" || body.action?.startsWith("payment.")) {
      const paymentData = await getMercadoPagoPayment(dataId);

      if (!paymentData) {
        return NextResponse.json(
          { message: "Pagamento não encontrado no Mercado Pago." },
          { status: 200 },
        );
      }

      const statusMap: Record<string, "PAID" | "CANCELLED" | "PENDING"> = {
        approved: "PAID",
        cancelled: "CANCELLED",
        rejected: "CANCELLED",
        refunded: "CANCELLED",
        charged_back: "CANCELLED",
      };

      const newStatus = statusMap[paymentData.status] ?? "PENDING";
      const orderId = paymentData.external_reference;

      if (orderId) {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: newStatus },
        });
      } else {
        await prisma.order.updateMany({
          where: { mpPaymentId: String(dataId) },
          data: { status: newStatus },
        });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido";

    console.error("Erro no processamento do Webhook Mercado Pago:", error);
    return NextResponse.json({ error: errorMessage }, { status: 200 });
  }
}
