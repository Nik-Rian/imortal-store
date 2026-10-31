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
  const now = new Date();
  return prisma.drop.findFirst({
    where: {
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: { createdAt: "desc" },
  });
});

/**
 * The drop the storefront presents: the active one if any, otherwise the one
 * that ended most recently (BD-01: products stay visible, sales closed).
 * Null means there is no drop at all.
 */
export const getStorefrontDrop = cache(async () => {
  const active = await getActiveDrop();
  if (active) return active;

  return prisma.drop.findFirst({ orderBy: { endsAt: "desc" } });
});

export const getAdminDrops = cache(async () => {
  const now = new Date();

  const drops = await prisma.drop.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      startsAt: true,
      endsAt: true,
      _count: { select: { products: true } },
    },
  });

  return drops.map(({ _count, ...drop }) => ({
    ...drop,
    productCount: _count.products,
    isClosed: drop.endsAt < now,
  }));
});
