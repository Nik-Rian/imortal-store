"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";
import { deleteBlobImages } from "./blob.actions";

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
 * Purges an active drop period and all dependent Order, OrderItem, Product, and ProductVariant rows.
 */
export async function purgeDrop(dropId: string) {
  await requireSession();


  if (!dropId) {
    throw new Error("ID do drop não fornecido.");
  }

  let imagesToDelete: string[] = [];

  await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { dropId },
      select: { id: true, images: true, variants: { select: { image: true } } },
    });

    const productIds = products.map((p) => p.id);

    imagesToDelete = products.flatMap((p) => [
      ...p.images,
      ...p.variants.flatMap((v) => (v.image ? [v.image] : [])),
    ]);

    if (productIds.length > 0) {
      const orderItems = await tx.orderItem.findMany({
        where: { productId: { in: productIds } },
        select: { orderId: true },
      });
      const orderIds = Array.from(
        new Set(orderItems.map((oi) => oi.orderId).filter(Boolean)),
      );

      await tx.orderItem.deleteMany({
        where: {
          OR: [
            { productId: { in: productIds } },
            ...(orderIds.length > 0 ? [{ orderId: { in: orderIds } }] : []),
          ],
        },
      });

      if (orderIds.length > 0) {
        await tx.order.deleteMany({
          where: { id: { in: orderIds } },
        });
      }

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
  });

  if (imagesToDelete.length > 0) {
    await deleteBlobImages(imagesToDelete);
  }

  revalidatePath("/");
  revalidatePath("/produto/[slug]", "page");
  revalidatePath("/admin");
  revalidatePath("/admin/produtos");
}
