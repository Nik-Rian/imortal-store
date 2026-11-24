import { getProductImage } from "@/lib/media";

export type ListingState = "OPEN" | "CLOSED";
export type ListingGroup = "BUNDLES" | "PRODUCTS";

export interface ListingVariantSource {
  id: string;
  name: string;
  image: string | null;
  isAvailable: boolean;
}

export interface ListingProductSource {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  images: readonly string[];
  isAvailable: boolean;
  isBundle: boolean;
  hasVariants: boolean;
  showVariantsInStore: boolean;
  variants: readonly ListingVariantSource[];
}

export interface Listing {
  key: string;
  productId: string;
  variantId: string | null;
  title: string;
  href: string;
  imageUrl: string;
  priceCents: number;
  state: ListingState;
  group: ListingGroup;
}

function buildProductListings(product: ListingProductSource): Listing[] {
  const group: ListingGroup = product.isBundle ? "BUNDLES" : "PRODUCTS";
  const productPath = `/produto/${product.slug}`;
  const productImage = getProductImage(product.images);
  // Variant rows of a product that is not flagged hasVariants are stale data
  // and never produce listings, matching the product page behavior.
  const hasVariants = product.hasVariants && product.variants.length > 0;

  if (hasVariants && product.showVariantsInStore) {
    return product.variants.map((variant): Listing => ({
      key: `${product.id}:${variant.id}`,
      productId: product.id,
      variantId: variant.id,
      title: `${product.name} - ${variant.name}`,
      href: `${productPath}?variante=${encodeURIComponent(variant.id)}`,
      imageUrl: variant.image || productImage,
      priceCents: product.priceCents,
      state: product.isAvailable && variant.isAvailable ? "OPEN" : "CLOSED",
      group,
    }));
  }

  // A single listing is closed when every variant is unavailable, as the
  // product page already reports such a product as sold out.
  const hasAvailableVariant =
    !hasVariants || product.variants.some((variant) => variant.isAvailable);

  return [
    {
      key: product.id,
      productId: product.id,
      variantId: null,
      title: product.name,
      href: productPath,
      imageUrl: productImage,
      priceCents: product.priceCents,
      state: product.isAvailable && hasAvailableVariant ? "OPEN" : "CLOSED",
      group,
    },
  ];
}

/**
 * Turns storefront products into ordered listings: bundles first, then
 * regular products. The input order is preserved inside each group.
 */
export function buildListings(
  products: readonly ListingProductSource[],
): Listing[] {
  const listings = products.flatMap((product) => buildProductListings(product));

  return [
    ...listings.filter((listing) => listing.group === "BUNDLES"),
    ...listings.filter((listing) => listing.group === "PRODUCTS"),
  ];
}

/**
 * Variant id selected when the product page opens: the requested variant when
 * it belongs to the product and is available, otherwise the first available
 * variant, otherwise null.
 */
export function resolveInitialVariant(
  variants: readonly { id: string; isAvailable: boolean }[],
  requestedVariantId: string | null | undefined,
): string | null {
  const requested = requestedVariantId
    ? variants.find((variant) => variant.id === requestedVariantId)
    : undefined;

  if (requested?.isAvailable) return requested.id;

  return variants.find((variant) => variant.isAvailable)?.id ?? null;
}
