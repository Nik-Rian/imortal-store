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
