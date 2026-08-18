import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createPixPayment } from "@/services/mercadopago.service";
import crypto from "node:crypto";

// Validation schema for incoming Pix checkout payload
const checkoutPixSchema = z.object({
  customerName: z.string().min(2, "Name must be at least 2 characters"),
  customerEmail: z.string().email("Invalid email address"),
  customerCpf: z.string().min(11, "CPF must be at least 11 digits"),
  customerPhone: z.string().min(10, "Phone number is required"),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Product ID is required"),
        variantId: z.string().min(1, "Variant ID is required"),
        quantity: z.number().int().min(1, "Quantity must be at least 1"),
      }),
    )
    .min(1, "Cart cannot be empty"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = checkoutPixSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { customerName, customerEmail, customerCpf, customerPhone, items } =
      validation.data;

    // 1. Fetch variant and product details (including Drop) to calculate prices server-side
    const variantIds = items.map((item) => item.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: {
          include: {
            drop: true,
          },
        },
      },
    });

    if (variants.length !== items.length) {
      return NextResponse.json(
        { error: "One or more selected items are no longer available." },
        { status: 400 },
      );
    }

    let calculatedTotalCents = 0;
    const orderItemsToCreate = items.map((item) => {
      const variant = variants.find((v) => v.id === item.variantId);
      if (!variant || !variant.product.isAvailable) {
        throw new Error(
          `Product ${variant?.product.name || item.productId} is not available.`,
        );
      }

      const itemPriceCents = variant.product.priceCents;
      calculatedTotalCents += itemPriceCents * item.quantity;

      return {
        productId: variant.productId,
        variantId: variant.id,
        productName: variant.product.name,
        dropName: variant.product.drop.name,
        variantSize: variant.size,
        unitPriceCents: itemPriceCents,
        quantity: item.quantity,
      };
    });

    const accessToken = crypto.randomBytes(32).toString("hex");
    // Define cancellation window (e.g., 30 minutes from now)
    const cancelableUntil = new Date(Date.now() + 30 * 60 * 1000);

    // 2. Create Order in database matching Prisma schema
    const order = await prisma.order.create({
      data: {
        accessToken,
        customerName,
        customerEmail,
        customerPhone,
        totalPriceCents: calculatedTotalCents,
        status: "PENDING",
        cancelableUntil,
        items: {
          create: orderItemsToCreate,
        },
      },
    });

    // 3. Request Pix charge generation from Mercado Pago API
    try {
      const nameParts = customerName.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || "Imortal";
      const amountInReais = calculatedTotalCents / 100;

      const pixResult = await createPixPayment({
        amount: amountInReais,
        description: `Imortal Store - Pedido #${order.id.slice(0, 8)}`,
        orderId: order.id,
        email: customerEmail,
        cpf: customerCpf,
        firstName,
        lastName,
      });

      // 4. Update order with Mercado Pago payment metadata according to schema fields
      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: {
          mpPaymentId: pixResult.id,
          pixQrCode: pixResult.qrCode,
          pixQrCodeBase64: pixResult.qrCodeBase64,
          pixExpiration: cancelableUntil,
        },
      });

      return NextResponse.json(
        {
          success: true,
          orderId: updatedOrder.id,
          accessToken: updatedOrder.accessToken,
          qrCode: pixResult.qrCode,
          qrCodeBase64: pixResult.qrCodeBase64,
          ticketUrl: pixResult.ticketUrl,
        },
        { status: 201 },
      );
    } catch (mpError) {
      console.error("[CHECKOUT_PIX] Mercado Pago Payment Error:", mpError);

      // Rollback: Cancel order in database if payment gateway call failed (enum: CANCELLED)
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });

      return NextResponse.json(
        { error: "Failed to generate Pix payment. Please try again." },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("[CHECKOUT_PIX_ERROR]", error);
    return NextResponse.json(
      { error: "Internal server error during checkout processing." },
      { status: 500 },
    );
  }
}
