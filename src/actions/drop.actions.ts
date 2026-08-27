"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";
import { deleteBlobImages } from "./blob.actions";

/**
 * Instantly closes sales for an entire drop by setting its endsAt date to now.
 */
export async function closeDropSales(dropId: string) {
  await requireSession();

  await prisma.drop.update({
    where: { id: dropId },
    data: {
      endsAt: new Date(),
    },
  });

  revalidatePath("/");
  revalidatePath("/admin/produtos");
}

/**
 * Auto-generates and creates a new active semester Drop.
 */
export async function createDrop() {
  await requireSession();

  const now = new Date();
  const year = now.getFullYear();
  const semester = now.getMonth() < 6 ? 1 : 2;
  const name = `${year}.${semester}`;
  const slug = `${year}-${semester}`;

  const endsAt = new Date(now);
  endsAt.setMonth(endsAt.getMonth() + 6);

  await prisma.drop.create({
    data: {
      name,
      slug,
      startsAt: now,
      endsAt,
    },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/produtos");
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
      select: { id: true, images: true },
    });

    const productIds = products.map((p) => p.id);

    imagesToDelete = products.flatMap((p) => p.images);

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
  revalidatePath("/admin");
  revalidatePath("/admin/produtos");
}
