"use server";

import { prisma } from "@/lib/prisma";
import {
  checkoutSchema,
  CheckoutInput,
} from "@/lib/validations/checkout.schema";
import { CartItem } from "@/types/cart";
import { randomUUID } from "crypto";

export async function createOrder(input: CheckoutInput, items: CartItem[]) {
  const validated = checkoutSchema.parse(input);

  if (!items || items.length === 0) {
    return { success: false, error: "Seu carrinho está vazio." };
  }

  const totalPriceCents = items.reduce(
    (acc, item) => acc + item.priceCents * item.quantity,
    0,
  );

  const accessToken = randomUUID();
  const cancelableUntil = new Date(Date.now() + 30 * 60 * 1000);

  try {
    const order = await prisma.order.create({
      data: {
        accessToken,
        status: "PENDING",
        customerName: validated.customerName,
        customerPhone: validated.customerPhone,
        customerEmail: validated.customerEmail,
        totalPriceCents,
        cancelableUntil,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            productName: item.name,
            dropName: "Geral",
            variantId: item.variantId ?? null,
            variantSize: item.size ?? null,
            quantity: item.quantity,
            unitPriceCents: item.priceCents,
          })),
        },
      },
    });

    return { success: true, accessToken: order.accessToken };
  } catch (error) {
    console.error("Failed to create order:", error);
    return {
      success: false,
      error: "Não foi possível processar seu pedido. Tente novamente.",
    };
  }
}
