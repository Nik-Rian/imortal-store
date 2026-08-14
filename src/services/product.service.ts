import { prisma } from "@/lib/prisma";
import { cache } from "react";

export interface GetProductsOptions {
  activeOnly?: boolean;
}

export const getProducts = cache(async (options: GetProductsOptions = {}) => {
  const { activeOnly = true } = options;
  const now = new Date();

  return await prisma.product.findMany({
    where: activeOnly
      ? {
          drop: {
            startsAt: { lte: now },
            endsAt: { gte: now },
          },
        }
      : undefined,
    include: {
      drop: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
});

export const getProductBySlug = cache(
  async (slug: string, options: GetProductsOptions = {}) => {
    const { activeOnly = true } = options;
    const now = new Date();

    return await prisma.product.findFirst({
      where: {
        slug,
        ...(activeOnly
          ? {
              drop: {
                startsAt: { lte: now },
                endsAt: { gte: now },
              },
            }
          : {}),
      },
      include: {
        drop: true,
        variants: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  },
);

export const getProductById = cache(async (id: string) => {
  return await prisma.product.findUnique({
    where: { id },
    include: {
      drop: true,
      variants: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });
});
