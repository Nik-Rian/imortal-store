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
