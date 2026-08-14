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

export interface AvailabilityCheckResult {
  available: boolean;
  reason?:
    | "DROP_ENDED"
    | "PRODUCT_UNAVAILABLE"
    | "VARIANT_UNAVAILABLE"
    | "NOT_FOUND";
}

export async function checkProductAvailability(
  productId: string,
  variantId?: string,
): Promise<AvailabilityCheckResult> {
  const now = new Date();
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      drop: true,
      variants: true,
    },
  });

  if (!product) {
    return { available: false, reason: "NOT_FOUND" };
  }

  // Check Drop active window
  if (product.drop.startsAt > now || product.drop.endsAt < now) {
    return { available: false, reason: "DROP_ENDED" };
  }

  // Master Product Availability switch
  if (!product.isAvailable) {
    return { available: false, reason: "PRODUCT_UNAVAILABLE" };
  }

  // Variant-level Availability switch (if item has a variant)
  if (variantId) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant || !variant.isAvailable) {
      return { available: false, reason: "VARIANT_UNAVAILABLE" };
    }
  }

  return { available: true };
}
