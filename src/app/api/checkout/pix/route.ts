import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createPixPayment } from "@/services/mercadopago.service";
import { prisma } from "@/lib/prisma";

interface CartItemInput {
  productId: string;
  variantId?: string;
  productName: string;
  dropName: string;
  variantSize?: string;
  unitPriceCents: number;
  quantity: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      items,
      customerName,
      customerEmail,
      customerPhone,
      cpf,
      firstName,
      lastName,
    }: {
      items: CartItemInput[];
      customerName: string;
      customerEmail?: string;
      customerPhone?: string;
      cpf?: string;
      firstName?: string;
      lastName?: string;
    } = body;

    // Calculate total price in cents from item list
    const totalPriceCents = items.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0,
    );

    // Create order in database matching your exact Prisma Schema
    const dbOrder = await prisma.order.create({
      data: {
        accessToken: randomBytes(32).toString("hex"),
        customerName,
        customerEmail,
        customerPhone,
        totalPriceCents,
        cancelableUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            dropName: item.dropName,
            variantSize: item.variantSize,
            unitPriceCents: item.unitPriceCents,
            quantity: item.quantity,
          })),
        },
      },
    });

    // Convert total price from cents to float for Mercado Pago (e.g., 10000 -> 100.00)
    const amountInReais = totalPriceCents / 100;

    // 3. Generate Pix payment via Mercado Pago v2 Orders API
    const pixResult = await createPixPayment({
      amount: amountInReais,
      description: `Order #${dbOrder.id}`,
      orderId: dbOrder.id,
      email: customerEmail || "customer@example.com",
      cpf,
      firstName,
      lastName,
    });

    return NextResponse.json({
      success: true,
      orderId: dbOrder.id,
      accessToken: dbOrder.accessToken,
      qrCode: pixResult.qrCode,
      qrCodeBase64: pixResult.qrCodeBase64,
      ticketUrl: pixResult.ticketUrl,
      status: pixResult.status,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to process payment";

    console.error("Checkout Error:", error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
