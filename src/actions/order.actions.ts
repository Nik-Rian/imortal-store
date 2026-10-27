"use server";

import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { checkProductAvailability } from "@/services/product.service";
import { createPixOrder } from "@/services/mercadopago.service";
import { requireSession } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";
import { OrderStatus } from "@/generated/prisma/client";
import {
  createOrderSchema,
  type CreateOrderInput,
} from "@/lib/validations/checkout.schema";

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
  let orderIdForRetry: string | undefined;
  let accessTokenForRetry: string | undefined;
  try {
    const parsed = createOrderSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0].message,
      };
    }

    const {
      orderId,
      accessToken,
      attemptKey,
      customerName,
      customerPhone,
      customerEmail,
      customerCpf,
      items,
    } = parsed.data;

    let order = null;

    if (orderId) {
      if (!accessToken) {
        return {
          success: false,
          error: "Acesso negado: token ausente para tentativa.",
        };
      }
      order = await prisma.order.findUnique({ where: { id: orderId } });
      if (order && order.accessToken !== accessToken) {
        return { success: false, error: "Acesso negado: token inválido." };
      }
    }

    if (!order && attemptKey) {
      order = await prisma.order.findFirst({ where: { idempotencyKey: attemptKey } });
    }

    if (!order) {
      const variantIds = items
        .map((item) => item.variantId)
        .filter((id): id is string => Boolean(id));

      const productIds = items
        .filter((item) => !item.variantId)
        .map((item) => item.productId)
        .filter((id): id is string => Boolean(id));

      const [variants, products] = await Promise.all([
        variantIds.length > 0
          ? prisma.productVariant.findMany({
              where: { id: { in: variantIds } },
              include: { product: { include: { drop: true } } },
            })
          : [],
        productIds.length > 0
          ? prisma.product.findMany({
              where: { id: { in: productIds } },
              include: { drop: true },
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
          if (!variant)
            return { success: false, error: "Variante do produto inválida." };

          const availability = await checkProductAvailability(
            variant.productId,
            variant.id,
          );
          if (!availability.available) {
            return {
              success: false,
              error:
                availability.reason === "DROP_ENDED"
                  ? `O drop do produto "${variant.product.name}" não está ativo no momento.`
                  : `O produto "${variant.product.name}" (${variant.size}) não está disponível.`,
            };
          }

          totalPriceCents += variant.product.priceCents * item.quantity;
          orderItemsData.push({
            productId: variant.productId,
            variantId: variant.id,
            productName: variant.product.name,
            dropName: variant.product.drop?.name ?? "",
            variantSize: variant.size ?? null,
            unitPriceCents: variant.product.priceCents,
            quantity: item.quantity,
          });
        } else if (item.productId) {
          const product = products.find((p) => p.id === item.productId);
          if (!product) return { success: false, error: "Produto inválido." };

          const availability = await checkProductAvailability(product.id);
          if (!availability.available) {
            return {
              success: false,
              error:
                availability.reason === "DROP_ENDED"
                  ? `O drop do produto "${product.name}" não está ativo no momento.`
                  : `O produto "${product.name}" não está disponível.`,
            };
          }

          totalPriceCents += product.priceCents * item.quantity;
          orderItemsData.push({
            productId: product.id,
            variantId: null,
            productName: product.name,
            dropName: product.drop?.name ?? "",
            variantSize: null,
            unitPriceCents: product.priceCents,
            quantity: item.quantity,
          });
        }
      }

      const cancelableUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const newAccessToken = randomUUID();
      const newIdempotencyKey = attemptKey || randomUUID();

      order = await prisma.order.create({
        data: {
          accessToken: newAccessToken,
          customerName,
          customerPhone: customerPhone ?? null,
          customerEmail: customerEmail ?? null,
          status: "PENDING",
          totalPriceCents,
          cancelableUntil,
          idempotencyKey: newIdempotencyKey,
          items: {
            createMany: {
              data: orderItemsData,
            },
          },
        },
      });
    }

    orderIdForRetry = order.id;
    accessTokenForRetry = order.accessToken;

    if (order.status !== "PENDING") {
      return {
        success: true,
        orderId: order.id,
        accessToken: order.accessToken,
      };
    }

    if (order.status === "PENDING" && order.pixQrCode && order.mpPaymentId) {
      return {
        success: true,
        orderId: order.id,
        accessToken: order.accessToken,
      };
    }

    let currentIdempotencyKey = order.idempotencyKey;
    if (!currentIdempotencyKey) {
      currentIdempotencyKey = attemptKey || randomUUID();
      await prisma.order.update({
        where: { id: order.id },
        data: { idempotencyKey: currentIdempotencyKey },
      });
    }

    // Clean and use the stateless CPF straight from the payload for the provider call
    const cleanedCpf = customerCpf.replace(/\D/g, "");

    const paymentResult = await createPixOrder({
      orderId: order.id,
      amount: order.totalPriceCents / 100,
      email: order.customerEmail ?? undefined,
      description: `Order #${order.id}`,
      firstName: order.customerName.split(" ")[0],
      lastName: order.customerName.split(" ").slice(1).join(" ") || undefined,
      phone: order.customerPhone ?? undefined,
      cpf: cleanedCpf,
      idempotencyKey: currentIdempotencyKey,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        mpPaymentId: paymentResult.paymentId,
        mpOrderId: paymentResult.orderId,
        pixQrCode: paymentResult.qrCode,
        pixQrCodeBase64: paymentResult.qrCodeBase64,
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
      error:
        error instanceof Error
          ? error.message
          : "Ocorreu um erro ao processar o pedido. Tente novamente.",
      orderId: orderIdForRetry,
      accessToken: accessTokenForRetry,
    };
  }
}

/**
 * Updates an order's status and revalidates the admin table.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
) {
  await requireSession();

  await prisma.order.update({
    where: { id: orderId },
    data: { status: newStatus },
  });

  revalidatePath("/admin/pedidos");
}

/**
 * Mass updates all currently "PAID" orders to "READY_FOR_PICKUP".
 */
export async function markAllPaidAsReady() {
  await requireSession();

  await prisma.order.updateMany({
    where: {
      paymentStatus: "PAID",
      status: "PENDING"
    },
    data: { status: "READY_FOR_PICKUP" },
  });

  revalidatePath("/admin/pedidos");
}
