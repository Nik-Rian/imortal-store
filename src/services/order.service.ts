import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getAdminOrders = cache(async (filter: "all" | "valid" = "all") => {
  return await prisma.order.findMany({
    where:
      filter === "valid"
        ? {
            paymentStatus: "PAID",
            status: { in: ["PENDING", "READY_FOR_PICKUP"] },
          }
        : undefined,
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
});

export const getCustomerOrders = cache(async (identifier: string) => {
  if (!identifier || identifier.trim() === "") return [];

  const cleanIdentifier = identifier.trim();

  return await prisma.order.findMany({
    where: {
      OR: [
        { customerEmail: cleanIdentifier },
        { customerPhone: cleanIdentifier },
      ],
    },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      totalPriceCents: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          quantity: true,
          productName: true,
          variantSize: true,
          unitPriceCents: true, // Fixed field name here
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
});
