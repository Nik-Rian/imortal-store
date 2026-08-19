"use server";

import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

interface CreateOrderInput {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  items: Array<{
    variantId?: string;
    productId?: string;
    quantity: number;
  }>;
}

interface OrderItemData {
  productId: string;
  variantId?: string | null;
  productName: string;
  dropName: string;
  variantSize?: string | null;
  unitPriceCents: number;
  quantity: number;
}

export async function createOrder(payload: CreateOrderInput) {
  try {
    const { customerName, customerPhone, customerEmail, items } = payload;

    if (!items || items.length === 0) {
      return { success: false, error: "O carrinho está vazio." };
    }

    const variantIds = items
      .map((item) => item.variantId)
      .filter((id): id is string => Boolean(id));

    const productIds = items
      .filter((item) => !item.variantId)
      .map((item) => item.productId)
      .filter((id): id is string => Boolean(id));

    // Fetch variants and standalone products concurrently
    const [variants, products] = await Promise.all([
      variantIds.length > 0
        ? prisma.productVariant.findMany({
            where: { id: { in: variantIds } },
            include: {
              product: {
                include: {
                  drop: true,
                },
              },
            },
          })
        : [],
      productIds.length > 0
        ? prisma.product.findMany({
            where: { id: { in: productIds } },
            include: {
              drop: true,
            },
          })
        : [],
    ]);

    if (variants.length + products.length !== items.length) {
      return {
        success: false,
        error: "Um ou mais produtos selecionados não foram encontrados.",
      };
    }

    let totalPriceCents = 0;
    const orderItemsData: OrderItemData[] = [];
    const now = new Date();

    for (const item of items) {
      if (item.variantId) {
        const variant = variants.find((v) => v.id === item.variantId);

        if (!variant) {
          return { success: false, error: "Variante do produto inválida." };
        }

        if (!variant.isAvailable || !variant.product.isAvailable) {
          return {
            success: false,
            error: `O produto "${variant.product.name}" (${variant.size}) não está disponível.`,
          };
        }

        const drop = variant.product.drop;
        if (drop && (now < drop.startsAt || now > drop.endsAt)) {
          return {
            success: false,
            error: `O drop do produto "${variant.product.name}" não está ativo no momento.`,
          };
        }

        const unitPriceCents = variant.product.priceCents;
        totalPriceCents += unitPriceCents * item.quantity;

        orderItemsData.push({
          productId: variant.productId,
          variantId: variant.id,
          productName: variant.product.name,
          dropName: drop?.name ?? "",
          variantSize: variant.size ?? null,
          unitPriceCents,
          quantity: item.quantity,
        });
      } else if (item.productId) {
        const product = products.find((p) => p.id === item.productId);

        if (!product) {
          return { success: false, error: "Produto inválido." };
        }

        if (!product.isAvailable) {
          return {
            success: false,
            error: `O produto "${product.name}" não está disponível.`,
          };
        }

        const drop = product.drop;
        if (drop && (now < drop.startsAt || now > drop.endsAt)) {
          return {
            success: false,
            error: `O drop do produto "${product.name}" não está ativo no momento.`,
          };
        }

        const unitPriceCents = product.priceCents;
        totalPriceCents += unitPriceCents * item.quantity;

        orderItemsData.push({
          productId: product.id,
          variantId: null,
          productName: product.name,
          dropName: drop?.name ?? "",
          variantSize: null,
          unitPriceCents,
          quantity: item.quantity,
        });
      }
    }

    const cancelableUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const accessToken = randomUUID();

    const order = await prisma.order.create({
      data: {
        accessToken,
        customerName,
        customerPhone: customerPhone ?? null,
        customerEmail: customerEmail ?? null,
        status: "PENDING",
        totalPriceCents,
        cancelableUntil,
        items: {
          createMany: {
            data: orderItemsData,
          },
        },
      },
    });

    return {
      success: true,
      orderId: order.id,
      accessToken: order.accessToken,
    };
  } catch (error) {
    console.error("Error creating order:", error);
    return {
      success: false,
      error: "Ocorreu um erro ao processar o pedido. Tente novamente.",
    };
  }
}
