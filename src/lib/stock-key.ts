/**
 * Deterministic key for one sellable combination, stored in StockItem.stockKey
 * (unique). A composite unique over the nullable variant/size columns would
 * allow duplicates, because Postgres treats NULLs as distinct.
 */
export function buildStockKey(
  productId: string,
  variantId?: string | null,
  sizeId?: string | null,
): string {
  return `${productId}#${variantId ?? ""}#${sizeId ?? ""}`;
}
