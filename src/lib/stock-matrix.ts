export interface SellableCombination {
  variantName: string | null;
  sizeLabel: string | null;
}

export interface StockMatrixRow extends SellableCombination {
  onHand: number;
  isAvailable: boolean;
}

export interface StockRowValues {
  onHand: number;
  reserved: number;
  isAvailable: boolean;
}

/** Minimal shape of a persisted StockItem needed to seed the form. */
export interface StockItemSnapshot {
  variantId: string | null;
  sizeId: string | null;
  onHand: number;
  reserved: number;
  isAvailable: boolean;
}

export const DEFAULT_STOCK_ROW_VALUES: StockRowValues = {
  onHand: 0,
  reserved: 0,
  isAvailable: true,
};

/**
 * Identity of a combination inside the form state and the posted payload.
 * Rows are matched by variant name and size label (both unique per product),
 * never by database identifiers.
 */
export function stockRowKey(combination: SellableCombination): string {
  return JSON.stringify([combination.variantName, combination.sizeLabel]);
}

export function describeCombination(combination: SellableCombination): string {
  const parts = [combination.variantName, combination.sizeLabel].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(" / ") : "Produto";
}

const unique = (values: string[]) =>
  Array.from(new Set(values.filter((value) => value !== "")));

/**
 * Builds the sellable combinations of a product. A dimension is active only
 * when its flag is on and at least one option exists, the same rule applied
 * by the availability check, so the generated keys always match it.
 */
export function buildSellableCombinations(input: {
  hasVariants: boolean;
  variantNames: string[];
  hasSizes: boolean;
  sizeLabels: string[];
}): SellableCombination[] {
  const variantNames = unique(input.variantNames);
  const sizeLabels = unique(input.sizeLabels);
  const usesVariants = input.hasVariants && variantNames.length > 0;
  const usesSizes = input.hasSizes && sizeLabels.length > 0;

  if (usesVariants && usesSizes) {
    return variantNames.flatMap((variantName) =>
      sizeLabels.map((sizeLabel) => ({ variantName, sizeLabel })),
    );
  }
  if (usesVariants) {
    return variantNames.map((variantName) => ({
      variantName,
      sizeLabel: null,
    }));
  }
  if (usesSizes) {
    return sizeLabels.map((sizeLabel) => ({ variantName: null, sizeLabel }));
  }
  return [{ variantName: null, sizeLabel: null }];
}

/** Converts persisted stock rows into form state keyed by name and label. */
export function mapStockItemsToRows(
  items: StockItemSnapshot[],
  variants: { id?: string; name: string }[],
  sizes: { id?: string; size: string }[],
): Record<string, StockRowValues> {
  const rows: Record<string, StockRowValues> = {};
  for (const item of items) {
    const variantName =
      item.variantId === null
        ? null
        : variants.find((v) => v.id === item.variantId)?.name;
    const sizeLabel =
      item.sizeId === null
        ? null
        : sizes.find((s) => s.id === item.sizeId)?.size;
    if (variantName === undefined || sizeLabel === undefined) continue;
    rows[stockRowKey({ variantName, sizeLabel })] = {
      onHand: item.onHand,
      reserved: item.reserved,
      isAvailable: item.isAvailable,
    };
  }
  return rows;
}

/** Carries the entered values over when a variant is renamed in the form. */
export function renameVariantInStockRows(
  rows: Record<string, StockRowValues>,
  previousName: string,
  nextName: string,
): Record<string, StockRowValues> {
  const renamed: Record<string, StockRowValues> = {};
  for (const [key, value] of Object.entries(rows)) {
    const [variantName, sizeLabel] = JSON.parse(key) as [
      string | null,
      string | null,
    ];
    const nextKey =
      variantName === previousName
        ? stockRowKey({ variantName: nextName, sizeLabel })
        : key;
    renamed[nextKey] = value;
  }
  return renamed;
}
