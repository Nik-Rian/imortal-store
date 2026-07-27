// src/services/product.service.ts
import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getProducts = cache(async () => {
  return await prisma.product.findMany({
    include: {
      drop: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
});

export const getProductBySlug = cache(async (slug: string) => {
  return await prisma.product.findUnique({
    where: { slug },
    include: {
      drop: true,
      variants: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });
});

export const getProductById = cache(async (id: string) => {
  return await prisma.product.findUnique({
    where: { id },
    include: {
      drop: true,
      variants: true,
    },
  });
});
