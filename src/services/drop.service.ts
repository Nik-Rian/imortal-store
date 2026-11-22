import type {
  DropStatus,
  OrderStatus,
  PaymentStatus,
} from "@/generated/prisma/client";
import {
  classifyOrdersForConclusion,
  type BlockingReason,
} from "@/lib/drop-conclusion";
import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getDrops = cache(async () => {
  return prisma.drop.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
    },
  });
});

export const getActiveDrop = cache(async () => {
  return prisma.drop.findFirst({
    where: { status: "ACTIVE" },
  });
});

/**
 * The drop the storefront presents: the active one, or null when none is
 * active (the storefront then shows the next-batch message and no catalogue).
 */
export const getStorefrontDrop = cache(async () => getActiveDrop());

export const getAdminDrops = cache(async () => {
  const drops = await prisma.drop.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      _count: { select: { products: true } },
    },
  });

  return drops.map(({ _count, ...drop }) => ({
    ...drop,
    productCount: _count.products,
  }));
});

const CONCLUSION_SAMPLE_SIZE = 5;

export interface ConclusionOrderSample {
  id: string;
  customerName: string;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  blockingReason: BlockingReason | null;
}

export interface DropConclusionSummary {
  dropId: string;
  dropName: string;
  dropStatus: DropStatus;
  blockingCount: number;
  blockingByReason: Record<BlockingReason, number>;
  acknowledgeableCount: number;
  blockingSample: ConclusionOrderSample[];
  acknowledgeableSample: ConclusionOrderSample[];
}

type ConclusionReadClient = Pick<
  typeof prisma,
  "drop" | "product" | "orderItem" | "order"
>;

/**
 * Read-only summary of the orders that block or qualify a drop for
 * conclusion. Accepts a transaction client so the conclusion action can
 * evaluate the same rules inside its transaction. Deliberately not wrapped in
 * `cache`: callers need fresh data on every call.
 * Returns null when the drop does not exist.
 */
export async function getDropConclusionSummary(
  dropId: string,
  client: ConclusionReadClient = prisma,
): Promise<DropConclusionSummary | null> {
  const drop = await client.drop.findUnique({
    where: { id: dropId },
    select: { name: true, status: true },
  });
  if (!drop) return null;

  const products = await client.product.findMany({
    where: { dropId },
    select: { id: true },
  });
  const productIds = products.map((p) => p.id);

  // Orders have no direct drop link. They are reached through the items'
  // products and through the dropName snapshot, which survives product
  // deletion, so no order escapes the check.
  const orderItems = await client.orderItem.findMany({
    where: {
      OR: [
        ...(productIds.length > 0 ? [{ productId: { in: productIds } }] : []),
        { dropName: drop.name },
      ],
    },
    select: { orderId: true },
  });
  const orderIds = Array.from(new Set(orderItems.map((oi) => oi.orderId)));

  const orders =
    orderIds.length > 0
      ? await client.order.findMany({
          where: { id: { in: orderIds } },
          select: {
            id: true,
            customerName: true,
            paymentStatus: true,
            status: true,
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

  const { blocking, acknowledgeable } = classifyOrdersForConclusion(orders);

  const blockingByReason: Record<BlockingReason, number> = {
    PAYMENT_PENDING: 0,
    PAYMENT_IN_REVIEW: 0,
    CHARGEBACK_IN_REVIEW: 0,
    LATE_PAYMENT: 0,
  };
  for (const order of blocking) {
    blockingByReason[order.blockingReason] += 1;
  }

  return {
    dropId,
    dropName: drop.name,
    dropStatus: drop.status,
    blockingCount: blocking.length,
    blockingByReason,
    acknowledgeableCount: acknowledgeable.length,
    blockingSample: blocking.slice(0, CONCLUSION_SAMPLE_SIZE),
    acknowledgeableSample: acknowledgeable
      .slice(0, CONCLUSION_SAMPLE_SIZE)
      .map((order) => ({ ...order, blockingReason: null })),
  };
}
