import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { OrderStatus } from "@/generated/prisma/client";

export const getAdminOrders = cache(async (filter: "all" | "valid" = "all") => {
  const validStatuses: OrderStatus[] = [
    "PAID",
    "READY_FOR_PICKUP",
    "COMPLETED",
  ];

  return await prisma.order.findMany({
    where: filter === "valid" ? { status: { in: validStatuses } } : undefined,
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
});
