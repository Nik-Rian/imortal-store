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
