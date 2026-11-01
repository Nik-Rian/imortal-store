import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { buildStockKey } from "@/lib/stock-key";
import { getStorefrontDrop } from "@/services/drop.service";

export interface GetProductsOptions {
  activeOnly?: boolean;
}

export const getProducts = cache(async (options: GetProductsOptions = {}) => {
  const { activeOnly = true } = options;

  try {
    // activeOnly is the storefront view (BD-01): only the products of the drop
    // the storefront presents, whether its sales window is open or closed.
    const storefrontDrop = activeOnly ? await getStorefrontDrop() : null;
    if (activeOnly && !storefrontDrop) return [];

    return await prisma.product.findMany({
      where: storefrontDrop ? { dropId: storefrontDrop.id } : undefined,
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

    try {
      const storefrontDrop = activeOnly ? await getStorefrontDrop() : null;
      if (activeOnly && !storefrontDrop) return null;

      return await prisma.product.findFirst({
        where: {
          slug,
          ...(storefrontDrop ? { dropId: storefrontDrop.id } : {}),
        },
        include: {
          drop: true,
          sizes: {
            orderBy: { sortOrder: "asc" },
          },
          variants: {
            orderBy: { sortOrder: "asc" },
          },
          components: {
            orderBy: { componentProduct: { name: "asc" } },
            select: {
              quantity: true,
              componentProduct: {
                select: { id: true, name: true, images: true },
              },
            },
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
        sizes: {
          orderBy: { sortOrder: "asc" },
        },
        variants: {
          orderBy: { sortOrder: "asc" },
        },
        components: {
          orderBy: { componentProduct: { name: "asc" } },
        },
        _count: { select: { componentOf: true } },
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
      stockItems: true,
    },
  });
  if (!product) return { available: false, reason: "NOT_FOUND" };
  if (product.drop.startsAt > now || product.drop.endsAt < now) {
    return { available: false, reason: "DROP_ENDED" };
  }
  if (!product.isAvailable) {
    return { available: false, reason: "PRODUCT_UNAVAILABLE" };
  }

  // Same rule as the storefront: a dimension is active only when the flag is
  // on and rows exist. When active, a valid selection is required.
  const usesVariants = product.hasVariants && product.variants.length > 0;
  const usesSizes = product.hasSizes && product.sizes.length > 0;

  if (usesVariants) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant || !variant.isAvailable) {
      return { available: false, reason: "VARIANT_UNAVAILABLE" };
    }
  }
  if (usesSizes) {
    const size = product.sizes.find((s) => s.id === sizeId);
    if (!size || !size.isAvailable) {
      return { available: false, reason: "SIZE_UNAVAILABLE" };
    }
  }

  if (product.controlStock) {
    const key = buildStockKey(
      productId,
      usesVariants ? variantId : null,
      usesSizes ? sizeId : null,
    );
    const stockItem = product.stockItems.find((s) => s.stockKey === key);
    if (!stockItem) return { available: false, reason: "OUT_OF_STOCK" };
    if (stockItem.onHand - stockItem.reserved < requestedQuantity) {
      return { available: false, reason: "OUT_OF_STOCK" };
    }
  }
  return { available: true };
}
