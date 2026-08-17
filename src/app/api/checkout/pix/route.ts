import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createPixPayment } from "@/services/mercadopago.service";

const pixCheckoutSchema = z.object({
  orderId: z.string().min(1, "ID do pedido é obrigatório"),
  cpf: z
    .string()
    .transform((val) => val.replace(/\D/g, ""))
    .refine((val) => val.length === 11, "CPF deve ter 11 dígitos"),
  email: z.string().email("E-mail inválido").optional(),
  amount: z.number().positive("O valor deve ser maior que zero").optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parseResult = pixCheckoutSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos para geração do Pix",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const {
      orderId,
      cpf,
      email: payloadEmail,
      amount: payloadAmount,
    } = parseResult.data;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Pedido não encontrado." },
        { status: 404 },
      );
    }

    const email = payloadEmail || order.customerEmail;
    if (!email) {
      return NextResponse.json(
        { error: "E-mail é obrigatório para pagamentos via Pix." },
        { status: 400 },
      );
    }

    const amount = payloadAmount ?? order.totalPriceCents / 100;

    const nameParts = order.customerName.trim().split(" ");
    const firstName = nameParts[0] || "Cliente";
    const lastName = nameParts.slice(1).join(" ") || undefined;

    const payment = await createPixPayment({
      amount,
      description: `Pedido #${order.id.slice(-6)} - imortal-store`,
      orderId: order.id,
      email,
      cpf,
      firstName,
      lastName,
    });

    return NextResponse.json(
      {
        success: true,
        paymentId: payment.id,
        status: payment.status,
        statusDetail: payment.statusDetail,
        externalReference: payment.externalReference,
        qrCode: payment.qrCode,
        qrCodeBase64: payment.qrCodeBase64,
        ticketUrl: payment.ticketUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Erro na API de Checkout Pix:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao processar checkout Pix";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
