import {
  evaluateAvailability,
  type AvailabilityReason,
} from "@/lib/order-lines";
import { prisma } from "@/lib/prisma";
import { getStorefrontDrop } from "@/services/drop.service";
import { cache } from "react";

export interface GetProductsOptions {
  activeOnly?: boolean;
}

// Bundle components with everything the availability computation needs:
// the component product's own options, drop and stock rows.
const bundleComponentsWithAvailabilityData = {
  orderBy: { componentProduct: { name: "asc" } },
  select: {
    quantity: true,
    componentProduct: {
      select: {
        id: true,
        name: true,
        images: true,
        priceCents: true,
        isAvailable: true,
        controlStock: true,
        hasSizes: true,
        hasVariants: true,
        drop: { select: { name: true, status: true } },
        variants: { orderBy: { sortOrder: "asc" } },
        sizes: { orderBy: { sortOrder: "asc" } },
        stockItems: true,
      },
    },
  },
} as const;

// Database errors are intentionally not caught in the read functions below:
// they must reach the error boundary and must never be cached as an empty
// result. A missing record is still reported as null (or an empty list when
// there is no storefront drop).
export const getProducts = cache(async (options: GetProductsOptions = {}) => {
  const { activeOnly = true } = options;

  // activeOnly is the storefront view: only the products of the drop
  // the storefront presents, whether its sales window is open or closed.
  const storefrontDrop = activeOnly ? await getStorefrontDrop() : null;
  if (activeOnly && !storefrontDrop) return [];

  return prisma.product.findMany({
    where: storefrontDrop ? { dropId: storefrontDrop.id } : undefined,
    include: {
      drop: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
});

// Storefront listing source: the products of the presented drop with the
// variants and bundle components needed to build listings in one query.
export const getStorefrontProducts = cache(async () => {
  const storefrontDrop = await getStorefrontDrop();
  if (!storefrontDrop) return [];

  return prisma.product.findMany({
    where: { dropId: storefrontDrop.id },
    include: {
      drop: true,
      sizes: {
        orderBy: { sortOrder: "asc" },
      },
      variants: {
        orderBy: { sortOrder: "asc" },
      },
      stockItems: true,
      components: bundleComponentsWithAvailabilityData,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
});

export const getProductBySlug = cache(
  async (slug: string, options: GetProductsOptions = {}) => {
    const { activeOnly = true } = options;

    const storefrontDrop = activeOnly ? await getStorefrontDrop() : null;
    if (activeOnly && !storefrontDrop) return null;

    return prisma.product.findFirst({
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
        components: bundleComponentsWithAvailabilityData,
        stockItems: true,
      },
    });
  },
);

export const getProductById = cache(async (id: string) => {
  return prisma.product.findUnique({
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
      stockItems: true,
      _count: { select: { componentOf: true } },
    },
  });
});

export interface AvailabilityCheckResult {
  available: boolean;
  reason?: AvailabilityReason | "NOT_FOUND";
}

export async function checkProductAvailability(
  productId: string,
  variantId?: string,
  sizeId?: string,
  requestedQuantity: number = 1,
): Promise<AvailabilityCheckResult> {
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

  const variant = variantId
    ? (product.variants.find((v) => v.id === variantId) ?? null)
    : null;
  const size = sizeId
    ? (product.sizes.find((s) => s.id === sizeId) ?? null)
    : null;
  const stock = new Map(
    product.stockItems.map((item) => [item.stockKey, item] as const),
  );

  const failure = evaluateAvailability(
    [{ product, variant, size, quantity: requestedQuantity, components: [] }],
    stock,
  );

  return failure
    ? { available: false, reason: failure.reason }
    : { available: true };
}
