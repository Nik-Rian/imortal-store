import {
  availableUnits,
  evaluateAvailability,
  stockKeyFor,
  usesSizes,
  usesVariants,
  type AvailabilityReason,
  type ProductRecord,
  type ResolvedComponent,
  type ResolvedLine,
  type SizeRecord,
  type StockRecord,
  type VariantRecord,
} from "@/lib/order-lines";

export type AvailabilityState = "OPEN" | "CLOSED" | "SOLD_OUT";

export interface AvailabilityComponentInput {
  /** Units of the component inside one unit of the bundle. */
  quantity: number;
  componentProduct: ProductRecord & { stockItems: readonly StockRecord[] };
}

export interface AvailabilityProductInput extends ProductRecord {
  isBundle: boolean;
  stockItems: readonly StockRecord[];
  components: readonly AvailabilityComponentInput[];
}

export interface CombinationAvailability {
  variantId: string | null;
  sizeId: string | null;
  purchasable: boolean;
  /** Why the combination cannot be bought; null when it can. */
  reason: AvailabilityReason | null;
  /**
   * Units that can still be bought. Null when the combination has no stock
   * ceiling (untracked) or cannot be bought at all.
   */
  maxQuantity: number | null;
}

/** Plain data, safe to pass from a server component to a client component. */
export interface ProductAvailability {
  state: AvailabilityState;
  hasVariantOptions: boolean;
  hasSizeOptions: boolean;
  combinations: CombinationAvailability[];
}

type Option = { variant: VariantRecord | null; size: SizeRecord | null };

function listOptions(product: ProductRecord): Option[] {
  const variants: (VariantRecord | null)[] = usesVariants(product)
    ? [...product.variants]
    : [null];
  const sizes: (SizeRecord | null)[] = usesSizes(product)
    ? [...product.sizes]
    : [null];

  return variants.flatMap((variant) =>
    sizes.map((size) => ({ variant, size })),
  );
}

function buildStockMap(
  product: AvailabilityProductInput,
): Map<string, StockRecord> {
  const stock = new Map<string, StockRecord>();
  for (const row of product.stockItems) stock.set(row.stockKey, row);
  for (const entry of product.components) {
    for (const row of entry.componentProduct.stockItems) {
      stock.set(row.stockKey, row);
    }
  }
  return stock;
}

// A bundle is buyable only when every component has at least one option that
// the order decision accepts for the units the bundle needs. Components are
// distinct products, so their stock keys never overlap and can be checked
// independently. When no option works, OUT_OF_STOCK wins if any option failed
// for stock reasons.
function findBlockedComponentReason(
  product: AvailabilityProductInput,
  line: ResolvedLine,
  stock: ReadonlyMap<string, StockRecord>,
): AvailabilityReason | null {
  for (const entry of product.components) {
    const component = entry.componentProduct;
    const reasons = listOptions(component).map(({ variant, size }) => {
      const resolved: ResolvedComponent = {
        product: component,
        variant,
        size,
        quantity: entry.quantity,
      };
      return (
        evaluateAvailability([{ ...line, components: [resolved] }], stock)
          ?.reason ?? null
      );
    });

    const failures = reasons.filter(
      (reason): reason is AvailabilityReason => reason !== null,
    );
    if (failures.length < reasons.length) continue;

    return failures.includes("OUT_OF_STOCK") ? "OUT_OF_STOCK" : failures[0];
  }
  return null;
}

function stockCeiling(
  product: ProductRecord,
  variant: VariantRecord | null,
  size: SizeRecord | null,
  stock: ReadonlyMap<string, StockRecord>,
): number | null {
  if (!product.controlStock) return null;
  const row = stock.get(stockKeyFor(product, variant, size));
  return row ? availableUnits(row) : 0;
}

function evaluateCombination(
  product: AvailabilityProductInput,
  variant: VariantRecord | null,
  size: SizeRecord | null,
  stock: ReadonlyMap<string, StockRecord>,
): CombinationAvailability {
  const line: ResolvedLine = {
    product,
    variant,
    size,
    quantity: 1,
    components: [],
  };

  const reason =
    evaluateAvailability([line], stock)?.reason ??
    (product.isBundle
      ? findBlockedComponentReason(product, line, stock)
      : null);
  const purchasable = reason === null;

  return {
    variantId: variant?.id ?? null,
    sizeId: size?.id ?? null,
    purchasable,
    reason,
    maxQuantity: purchasable
      ? stockCeiling(product, variant, size, stock)
      : null,
  };
}

// OPEN when something can be bought. Otherwise SOLD_OUT only when stock was
// the cause; flag-only failures (manual closure) read as CLOSED, so untracked
// products can never be sold out.
function stateFromCombinations(
  combinations: readonly CombinationAvailability[],
): AvailabilityState {
  if (combinations.some((combination) => combination.purchasable)) {
    return "OPEN";
  }
  return combinations.some(
    (combination) => combination.reason === "OUT_OF_STOCK",
  )
    ? "SOLD_OUT"
    : "CLOSED";
}

/**
 * Listing state and purchasable combinations of one product, computed with
 * the same decision used by order creation. Dates are never read.
 */
export function computeProductAvailability(
  product: AvailabilityProductInput,
): ProductAvailability {
  const stock = buildStockMap(product);
  const combinations = listOptions(product).map(({ variant, size }) =>
    evaluateCombination(product, variant, size, stock),
  );

  return {
    state: stateFromCombinations(combinations),
    hasVariantOptions: usesVariants(product),
    hasSizeOptions: usesSizes(product),
    combinations,
  };
}

/** State of the listing of a single variant (one listing per variant). */
export function getVariantState(
  availability: ProductAvailability,
  variantId: string,
): AvailabilityState {
  return stateFromCombinations(
    availability.combinations.filter(
      (combination) => combination.variantId === variantId,
    ),
  );
}

export function findCombination(
  availability: ProductAvailability,
  variantId: string | null,
  sizeId: string | null,
): CombinationAvailability | undefined {
  return availability.combinations.find(
    (combination) =>
      combination.variantId === variantId && combination.sizeId === sizeId,
  );
}

export function isVariantPurchasable(
  availability: ProductAvailability,
  variantId: string,
): boolean {
  return availability.combinations.some(
    (combination) =>
      combination.variantId === variantId && combination.purchasable,
  );
}

/** A size is selectable when it can be bought with the given variant. */
export function isSizePurchasable(
  availability: ProductAvailability,
  variantId: string | null,
  sizeId: string,
): boolean {
  return availability.combinations.some(
    (combination) =>
      combination.variantId === variantId &&
      combination.sizeId === sizeId &&
      combination.purchasable,
  );
}
