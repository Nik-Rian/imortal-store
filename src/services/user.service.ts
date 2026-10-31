import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getUsers = cache(async () => {
  return prisma.user.findMany({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, createdAt: true },
  });
});
