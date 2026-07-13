import { prisma } from "@/lib/prisma";
import { cache } from "react";

/**
 * Fetches all products, ordered by newest first.
 * Wrapped in `cache` to memoize the database call during a single request lifecycle.
 */
export const getProducts = cache(async () => {
  return await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
  });
});

/**
 * Fetches a single product by its unique slug.
 * Returns null if the product is not found.
 */
export const getProductBySlug = cache(async (slug: string) => {
  return await prisma.product.findUnique({
    where: { slug },
  });
});

/**
 * Fetches a single product by its unique database ID.
 */
export const getProductById = cache(async (id: string) => {
  return await prisma.product.findUnique({
    where: { id },
  });
});