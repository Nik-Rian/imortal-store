export const PLACEHOLDER_IMAGE = "/placeholder.svg";

/** First product image, or the placeholder when the product has none. */
export function getProductImage(
  images: readonly string[] | null | undefined,
): string {
  return images?.[0] || PLACEHOLDER_IMAGE;
}
