"use server";

import { randomUUID } from "crypto";
import { OrderStatus } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth-guard";
import { describeCardFailure, PaymentRejectedError } from "@/lib/card-outcome";
import {
  buildOrderSnapshots,
  evaluateAvailability,
  resolveOrderLines,
  type AvailabilityFailure,
} from "@/lib/order-lines";
import { getAdminTransitionRule } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";
import {
  createOrderSchema,
  type CreateOrderInput,
} from "@/lib/validations/checkout.schema";
import { loadCheckoutCatalogue } from "@/services/checkout.service";
import {
  createCardOrder,
  createPixOrder,
  MercadoPagoTimeoutError,
} from "@/services/mercadopago.service";
import { revalidatePath } from "next/cache";

// Unexpected failures never expose Error.message to the customer: it can carry
// configuration or database details. Not exported because a "use server" module
// may only export async functions.
const ORDER_CREATION_FAILURE_MESSAGE =
  "Não foi possível processar o pedido agora. Tente novamente em instantes.";

const PROVIDER_TIMEOUT_FAILURE_MESSAGE =
  "O serviço de pagamento demorou para responder. Aguarde um momento e tente novamente.";

function availabilityErrorMessage(failure: AvailabilityFailure): string {
  const { reason, productName, variantName, sizeLabel, bundleName } = failure;

  if (bundleName) {
    const option = [variantName, sizeLabel].filter(Boolean).join(", ");
    const detail = option ? ` (${option})` : "";
    switch (reason) {
      case "DROP_ENDED":
        return `O drop do kit "${bundleName}" não está ativo no momento.`;
      case "VARIANT_UNAVAILABLE":
        return `A variação escolhida de "${productName}" não está disponível no kit "${bundleName}".`;
      case "SIZE_UNAVAILABLE":
        return `O tamanho escolhido de "${productName}" não está disponível no kit "${bundleName}".`;
      default:
        return `O kit "${bundleName}" não pode ser comprado: "${productName}"${detail} não está disponível ou possui estoque insuficiente.`;
    }
  }

  switch (reason) {
    case "DROP_ENDED":
      return `O drop do produto "${productName}" não está ativo no momento.`;
    case "VARIANT_UNAVAILABLE":
      return `Selecione uma variação válida e disponível para "${productName}".`;
    case "SIZE_UNAVAILABLE":
      return `Selecione um tamanho válido e disponível para "${productName}".`;
    default: {
      const detail = variantName ? ` (${variantName})` : "";
      return `O produto "${productName}"${detail} não está disponível ou possui estoque insuficiente.`;
    }
  }
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
      paymentMethod,
      card,
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
      order = await prisma.order.findFirst({
        where: { idempotencyKey: attemptKey },
      });
    }

    if (!order) {
      const catalogue = await loadCheckoutCatalogue(items);

      const resolution = resolveOrderLines(items, catalogue);
      if (!resolution.ok) {
        return { success: false, error: resolution.error };
      }

      const unavailable = evaluateAvailability(
        resolution.lines,
        catalogue.stock,
      );
      if (unavailable) {
        console.warn("[createOrder] Item unavailable", {
          productId: unavailable.productId,
          variantId: unavailable.variantId,
          sizeId: unavailable.sizeId,
          reason: unavailable.reason,
        });
        return {
          success: false,
          error: availabilityErrorMessage(unavailable),
        };
      }

      const { totalPriceCents, items: orderItemsData } = buildOrderSnapshots(
        resolution.lines,
      );
      const now = new Date();

      const cancelableUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const newAccessToken = randomUUID();
      const newIdempotencyKey = attemptKey || randomUUID();

      try {
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
            // createMany cannot create child rows, so each item is created
            // with its component snapshots in the same nested write.
            items: {
              create: orderItemsData.map(({ components, ...item }) => ({
                ...item,
                ...(components.length > 0
                  ? { components: { create: components } }
                  : {}),
              })),
            },
          },
        });
      } catch (createError) {
        const existing = attemptKey
          ? await prisma.order.findFirst({
              where: { idempotencyKey: attemptKey },
            })
          : null;
        if (!existing) throw createError;
        order = existing;
      }
    }

    orderIdForRetry = order.id;
    accessTokenForRetry = order.accessToken;

    if (order.status !== "PENDING" || order.paymentStatus !== "PENDING") {
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

    if (order.mpPaymentId && order.paymentMethod === "CARD") {
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
    const providerInput = {
      orderId: order.id,
      amount: order.totalPriceCents / 100,
      email: order.customerEmail ?? undefined,
      description: `Order #${order.id}`,
      firstName: order.customerName.split(" ")[0],
      lastName: order.customerName.split(" ").slice(1).join(" ") || undefined,
      phone: order.customerPhone ?? undefined,
      cpf: cleanedCpf,
      idempotencyKey: currentIdempotencyKey,
    };
    if (paymentMethod === "CARD") {
      if (!card) {
        // Unreachable after schema validation; keeps the types honest.
        return { success: false, error: "Dados do cartão ausentes." };
      }
      const cardResult = await createCardOrder({
        ...providerInput,
        token: card.token,
        paymentMethodId: card.paymentMethodId,
        paymentTypeId: card.paymentTypeId,
        installments: card.installments,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentMethod: "CARD",
          installments: card.installments,
          mpPaymentId: cardResult.paymentId,
          mpOrderId: cardResult.orderId,
        },
      });
      // Record the provider's raw status only if the webhook has not already
      // written a (newer) one. paymentStatus stays webhook-owned.
      await prisma.order.updateMany({
        where: { id: order.id, providerStatus: null },
        data: {
          providerStatus: cardResult.status,
          providerStatusDetail: cardResult.statusDetail ?? null,
        },
      });
    } else {
      const paymentResult = await createPixOrder(providerInput);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          mpPaymentId: paymentResult.paymentId,
          mpOrderId: paymentResult.orderId,
          pixQrCode: paymentResult.qrCode,
          pixQrCodeBase64: paymentResult.qrCodeBase64,
        },
      });
    }

    return {
      success: true,
      orderId: order.id,
      accessToken: order.accessToken,
    };
  } catch (error) {
    if (error instanceof PaymentRejectedError) {
      // The provider refused the payment. Its failed order is final and the
      // webhook cancels this local order (PAY-003), so the customer must start
      // a new order: no orderId/accessToken is returned for a retry.
      console.warn("[createOrder] Payment rejected by provider", {
        orderId: orderIdForRetry,
        statusDetail: error.statusDetail,
      });
      return {
        success: false,
        error: describeCardFailure(error.statusDetail),
        paymentRejected: true,
      };
    }

    if (error instanceof MercadoPagoTimeoutError) {
      // The provider may or may not have created the order. The retry reuses
      // the stored idempotency key, so the credentials are returned.
      console.warn("[createOrder] Payment provider timed out", {
        orderId: orderIdForRetry,
      });
      return {
        success: false,
        error: PROVIDER_TIMEOUT_FAILURE_MESSAGE,
        orderId: orderIdForRetry,
        accessToken: accessTokenForRetry,
      };
    }

    console.error("Error creating order:", error);
    return {
      success: false,
      error: ORDER_CREATION_FAILURE_MESSAGE,
      orderId: orderIdForRetry,
      accessToken: accessTokenForRetry,
    };
  }
}

/**
 * Moves an order through the fulfillment lifecycle only
 * (PENDING -> PREPARING -> READY_FOR_PICKUP -> COMPLETED, with a direct
 * PENDING -> READY_FOR_PICKUP shortcut). Payment status is owned by the
 * Mercado Pago webhook and is never changed here.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
) {
  await requireSession();

  // newStatus comes from the client, so the enum type is not a guarantee.
  // Anything that is not an offered step is rejected here.
  const rule = getAdminTransitionRule(newStatus);
  if (!rule) {
    return {
      success: false as const,
      error: "Transição de status não permitida.",
    };
  }

  // The state checks are part of the UPDATE itself, so they cannot race with a
  // webhook that changes the payment between a read and a write.
  const result = await prisma.order.updateMany({
    where: {
      id: orderId,
      status: { in: [...rule.from] },
      ...(rule.requiredPayment ? { paymentStatus: rule.requiredPayment } : {}),
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
 * Mass updates every paid order that is not yet ready (PENDING or PREPARING)
 * to "READY_FOR_PICKUP" and returns how many orders were changed.
 */
export async function markAllPaidAsReady() {
  await requireSession();

  const result = await prisma.order.updateMany({
    where: {
      paymentStatus: "PAID",
      status: { in: ["PENDING", "PREPARING"] },
    },
    data: { status: "READY_FOR_PICKUP" },
  });

  revalidatePath("/admin/pedidos");

  return { updatedCount: result.count };
}
