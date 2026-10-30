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
  productName: string;
  dropName: string;
  variantName: string | null;
  sizeLabel: string | null;
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
      const variantIds = [
        ...new Set(
          items
            .map((item) => item.variantId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const productIds = [
        ...new Set(
          items
            .filter((item) => !item.variantId)
            .map((item) => item.productId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const [variants, products] = await Promise.all([
        variantIds.length > 0
          ? prisma.productVariant.findMany({
              where: { id: { in: variantIds } },
              include: { product: { include: { drop: true, sizes: true } } },
            })
          : [],
        productIds.length > 0
          ? prisma.product.findMany({
              where: { id: { in: productIds } },
              include: { drop: true, sizes: true },
            })
          : [],
      ]);
      // Compare against distinct ids: the same product/variant can appear on
      // several cart lines (e.g. two sizes).
      if (
        variants.length !== variantIds.length ||
        products.length !== productIds.length
      ) {
        return {
          success: false,
          error: "Um ou mais produtos selecionados não foram encontrados.",
        };
      }

      let totalPriceCents = 0;
      const orderItemsData: OrderItemData[] = [];
      const now = new Date();

      for (const item of items) {
        const variant = item.variantId
          ? variants.find((v) => v.id === item.variantId)
          : null;

        const productId = variant ? variant.productId : item.productId;
        if (!productId) {
          return { success: false, error: "Produto do item não especificado." };
        }

        const product = variant
          ? variant.product
          : products.find((p) => p.id === productId);

        if (!product) {
          return { success: false, error: "Produto inválido." };
        }

        const sizeLabel = item.sizeId
          ? (product.sizes.find((s) => s.id === item.sizeId)?.size ?? null)
          : null;

        const availability = await checkProductAvailability(
          productId,
          item.variantId ?? undefined,
          item.sizeId ?? undefined,
          item.quantity,
        );

        if (!availability.available) {
          const detail = variant ? ` (${variant.name})` : "";

          console.warn("[createOrder] Item unavailable", {
            productId,
            variantId: item.variantId,
            sizeId: item.sizeId,
            reason: availability.reason,
          });

          return {
            success: false,
            error:
              availability.reason === "DROP_ENDED"
                ? `O drop do produto "${product.name}" não está ativo no momento.`
                : `O produto "${product.name}"${detail} não está disponível ou possui estoque insuficiente.`,
          };
        }

        totalPriceCents += product.priceCents * item.quantity;
        orderItemsData.push({
          productId: product.id,
          productName: product.name,
          dropName: product.drop?.name ?? "",
          variantName: variant ? variant.name : null,
          sizeLabel,
          unitPriceCents: product.priceCents,
          quantity: item.quantity,
        });
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
 * Moves an order through the fulfillment lifecycle only
 * (PENDING -> READY_FOR_PICKUP -> COMPLETED). Payment status is owned by the
 * Mercado Pago webhook and is never changed here.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
) {
  await requireSession();

  // target status -> status the order must currently have
  const requiredCurrentStatus: Partial<Record<OrderStatus, OrderStatus>> = {
    READY_FOR_PICKUP: "PENDING",
    COMPLETED: "READY_FOR_PICKUP",
  };
  const from = requiredCurrentStatus[newStatus];
  if (!from) {
    return {
      success: false as const,
      error: "Transição de status não permitida.",
    };
  }

  // The paid check is part of the UPDATE itself, so it cannot race with a
  // webhook that reverts the payment between a read and a write.
  const result = await prisma.order.updateMany({
    where: {
      id: orderId,
      status: from,
      ...(newStatus === "READY_FOR_PICKUP"
        ? { paymentStatus: "PAID" as const }
        : {}),
    },
    data: { status: newStatus },
  });

  revalidatePath("/admin/pedidos");

  if (result.count === 0) {
    return {
      success: false as const,
      error: "Pedido não está elegível para esta transição.",
    };
  }
  return { success: true as const };
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
