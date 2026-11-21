import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getUsers = cache(async () => {
  return prisma.user.findMany({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, createdAt: true },
  });
});
