import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getAdminOrders = cache(async (filter: "all" | "valid" = "all") => {
  return await prisma.order.findMany({
    where:
      filter === "valid"
        ? {
            paymentStatus: "PAID",
            status: { in: ["PENDING", "PREPARING", "READY_FOR_PICKUP"] },
          }
        : undefined,
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
});
