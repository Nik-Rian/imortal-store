"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";
import { deleteBlobImages } from "./blob.actions";
import type { PaymentStatus } from "@/generated/prisma/client";

type ActionResult = { success: true } | { success: false; error: string };

/**
 * Instantly closes sales for an open drop by setting its endsAt date to now.
 * Closing an already-closed drop is a no-op, so a stale click never moves
 * its endsAt forward.
 */
export async function closeDropSales(dropId: string) {
  await requireSession();

  const now = new Date();

  await prisma.drop.updateMany({
    where: { id: dropId, endsAt: { gte: now } },
    data: { endsAt: now },
  });

  revalidatePath("/");
  revalidatePath("/produto/[slug]", "page");
  revalidatePath("/admin");
  revalidatePath("/admin/produtos");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

const dropConflictError = (name: string) =>
  `Já existe um semestre ${name}. Apague-o antes de iniciar um novo semestre com o mesmo nome.`;

/**
 * Auto-generates and creates a new active semester Drop.
 * Expected failures are returned (not thrown) so the message survives
 * production builds, where thrown action errors are masked.
 */
export async function createDrop(): Promise<
  { success: true } | { success: false; error: string }
> {
  await requireSession();

  const now = new Date();
  const year = now.getFullYear();
  const semester = now.getMonth() < 6 ? 1 : 2;
  const name = `${year}.${semester}`;
  const slug = `${year}-${semester}`;

  const openDrop = await prisma.drop.findFirst({
    where: { endsAt: { gte: now } },
    select: { name: true },
  });
  if (openDrop) {
    return {
      success: false,
      error: `O semestre ${openDrop.name} ainda está aberto. Encerre as vendas dele antes de iniciar outro.`,
    };
  }

  const conflict = await prisma.drop.findFirst({
    where: { OR: [{ name }, { slug }] },
    select: { id: true },
  });
  if (conflict) {
    return { success: false, error: dropConflictError(name) };
  }

  const endsAt = new Date(now);
  endsAt.setMonth(endsAt.getMonth() + 6);

  try {
    await prisma.drop.create({
      data: { name, slug, startsAt: now, endsAt },
    });
  } catch (error) {
    // Lost a race against another create between the check and the insert.
    if (isUniqueConstraintError(error)) {
      return { success: false, error: dropConflictError(name) };
    }
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/produto/[slug]", "page");
  revalidatePath("/admin");
  revalidatePath("/admin/produtos");

  return { success: true };
}

/**
 * Payment states of orders that hold no money and no open obligation. Any
 * other state (pending, in review, paid, refunded, chargeback) is a record
 * that a purge must never destroy.
 */
const PURGEABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "FAILED",
  "EXPIRED",
  "CANCELED",
];

/**
 * Permanently deletes a closed drop and every dependent row (orders, items,
 * stock reservations, stock items, products, variants, bundle components).
 * Refuses, before deleting anything, unless the purge flag is enabled, the
 * sales window is closed and every order of the drop is FAILED, EXPIRED or
 * CANCELED without a payment review reason. Refusals are returned as { success: false, error } rather than thrown.
 */
export async function purgeDrop(dropId: string): Promise<ActionResult> {
  await requireSession();

  // Read at call time so the flag can change without a module reload.
  if (process.env.ALLOW_DESTRUCTIVE_PURGE !== "true") {
    return {
      success: false,
      error:
        "A exclusão permanente de semestres está desabilitada neste ambiente.",
    };
  }

  if (!dropId) {
    return { success: false, error: "ID do drop não fornecido." };
  }

  let imagesToDelete: string[] = [];

  let outcome: ActionResult;

  try {
    outcome = await prisma.$transaction(async (tx): Promise<ActionResult> => {
      const drop = await tx.drop.findUnique({
        where: { id: dropId },
        select: { name: true, endsAt: true },
      });
      if (!drop) {
        return { success: false, error: "Semestre não encontrado." };
      }
      if (drop.endsAt >= new Date()) {
        return {
          success: false,
          error: `O semestre ${drop.name} ainda está aberto. Encerre as vendas dele antes de apagá-lo.`,
        };
      }

      const products = await tx.product.findMany({
        where: { dropId },
        select: {
          id: true,
          images: true,
          variants: { select: { image: true } },
        },
      });

      const productIds = products.map((p) => p.id);

      imagesToDelete = products.flatMap((p) => [
        ...p.images,
        ...p.variants.flatMap((v) => (v.image ? [v.image] : [])),
      ]);

      // Orders have no direct drop link. They are reached through the items'
      // products and, for items whose product was already removed (productId
      // set to null), through the dropName snapshot, so none is missed.
      const orderItems = await tx.orderItem.findMany({
        where: {
          OR: [
            ...(productIds.length > 0
              ? [{ productId: { in: productIds } }]
              : []),
            { dropName: drop.name },
          ],
        },
        select: { orderId: true },
      });
      const orderIds = Array.from(new Set(orderItems.map((oi) => oi.orderId)));

      if (orderIds.length > 0) {
        const orders = await tx.order.findMany({
          where: { id: { in: orderIds } },
          select: { paymentStatus: true, paymentReviewReason: true },
        });
        const hasRetainedOrder = orders.some(
          (order) =>
            !PURGEABLE_PAYMENT_STATUSES.includes(order.paymentStatus) ||
            order.paymentReviewReason !== null,
        );
        if (hasRetainedOrder) {
          return {
            success: false,
            error: `O semestre ${drop.name} possui pedidos pagos, pendentes ou com pagamento em análise e não pode ser apagado.`,
          };
        }

        // StockReservation -> Order and -> StockItem are ON DELETE RESTRICT:
        // reservations must go before the orders and the stock items.
        await tx.stockReservation.deleteMany({
          where: { orderId: { in: orderIds } },
        });
      }

      if (productIds.length > 0) {
        await tx.stockItem.deleteMany({
          where: { productId: { in: productIds } },
        });
      }

      if (orderIds.length > 0) {
        await tx.orderItem.deleteMany({
          where: { orderId: { in: orderIds } },
        });
        await tx.order.deleteMany({
          where: { id: { in: orderIds } },
        });
      }

      if (productIds.length > 0) {
        await tx.productVariant.deleteMany({
          where: { productId: { in: productIds } },
        });

        // Bundle rows first: componentProductId is ON DELETE RESTRICT, so the
        // component and bundle products can't be removed while join rows exist.
        await tx.bundleComponent.deleteMany({
          where: {
            OR: [
              { bundleId: { in: productIds } },
              { componentProductId: { in: productIds } },
            ],
          },
        });

        await tx.product.deleteMany({
          where: { dropId },
        });
      }

      await tx.drop.delete({
        where: { id: dropId },
      });
      return { success: true };
    });
  } catch (error) {
    console.error("Erro ao apagar semestre:", error);
    return {
      success: false,
      error: "Não foi possível apagar o semestre. Tente novamente.",
    };
  }

  if (!outcome.success) {
    return outcome;
  }

  if (imagesToDelete.length > 0) {
    await deleteBlobImages(imagesToDelete);
  }

  revalidatePath("/");
  revalidatePath("/produto/[slug]", "page");
  revalidatePath("/admin");
  revalidatePath("/admin/produtos");

  return { success: true };
}
