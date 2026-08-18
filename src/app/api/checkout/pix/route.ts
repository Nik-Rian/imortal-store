import { NextResponse } from "next/server";
import { createPixPayment } from "@/services/mercadopago.service";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId, amount, email, firstName, lastName, cpf } = body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Pedido não encontrado." },
        { status: 404 },
      );
    }

    const pixResult = await createPixPayment({
      orderId: order.id,
      amount: amount ?? Number(order.totalPriceCents) / 100,
      email: email ?? order.customerEmail,
      description: `Pedido #${order.id.slice(0, 8)} - Imortal Store`,
      firstName,
      lastName,
      cpf,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        mpPaymentId: pixResult.id,
        pixQrCode: pixResult.qrCode,
        pixQrCodeBase64: pixResult.qrCodeBase64,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      paymentId: pixResult.id,
      qrCode: pixResult.qrCode,
      qrCodeBase64: pixResult.qrCodeBase64,
      ticketUrl: pixResult.ticketUrl,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro interno ao processar Pix.";

    console.error("Erro na rota checkout/pix:", error);

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
