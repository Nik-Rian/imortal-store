import { prisma } from "@/lib/prisma";
import { cache } from "react";

export interface GetProductsOptions {
  activeOnly?: boolean;
}

export const getProducts = cache(async (options: GetProductsOptions = {}) => {
  const { activeOnly = true } = options;
  const now = new Date();

  try {
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
  } catch (error) {
    console.warn(
      "[getProducts] Database connection failed. Returning fallback empty list.",
      error,
    );
    return [];
  }
});

export const getProductBySlug = cache(
  async (slug: string, options: GetProductsOptions = {}) => {
    const { activeOnly = true } = options;
    const now = new Date();

    try {
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
    } catch (error) {
      console.warn(
        `[getProductBySlug] Database connection failed for slug '${slug}'. Returning null.`,
        error,
      );
      return null;
    }
  },
);

export const getProductById = cache(async (id: string) => {
  try {
    return await prisma.product.findUnique({
      where: { id },
      include: {
        drop: true,
        variants: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  } catch (error) {
    console.warn(
      `[getProductById] Database connection failed for id '${id}'. Returning null.`,
      error,
    );
    return null;
  }
});

export interface AvailabilityCheckResult {
  available: boolean;
  reason?:
    | "DROP_ENDED"
    | "PRODUCT_UNAVAILABLE"
    | "VARIANT_UNAVAILABLE"
    | "SIZE_UNAVAILABLE"
    | "OUT_OF_STOCK"
    | "NOT_FOUND";
}

export async function checkProductAvailability(
  productId: string,
  variantId?: string,
  sizeId?: string,
  requestedQuantity: number = 1,
): Promise<AvailabilityCheckResult> {
  const now = new Date();
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      drop: true,
      variants: true,
      sizes: true,
      stockItems: {
        where: {
          variantId: variantId || null,
          sizeId: sizeId || null,
        },
      },
    },
  });

if (!product) return { available: false, reason: "NOT_FOUND" };
  if (product.drop.startsAt > now || product.drop.endsAt < now) return { available: false, reason: "DROP_ENDED" };
  if (!product.isAvailable) return { available: false, reason: "PRODUCT_UNAVAILABLE" };

  if (product.hasVariants && variantId) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant || !variant.isAvailable) return { available: false, reason: "VARIANT_UNAVAILABLE" };
  }

  if (product.hasSizes && sizeId) {
    const size = product.sizes.find((s) => s.id === sizeId);
    if (!size || !size.isAvailable) return { available: false, reason: "SIZE_UNAVAILABLE" };
  }

  if (product.controlStock) {
    const stockItem = product.stockItems[0];
    if (!stockItem) return { available: false, reason: "OUT_OF_STOCK" };

    const availableStock = stockItem.onHand - stockItem.reserved;
    if (availableStock < requestedQuantity) {
      return { available: false, reason: "OUT_OF_STOCK" };
    }
  }

  return { available: true };
}
