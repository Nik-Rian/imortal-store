import { buildStockKey } from "@/lib/stock-key";

export type AvailabilityReason =
  | "DROP_ENDED"
  | "PRODUCT_UNAVAILABLE"
  | "VARIANT_UNAVAILABLE"
  | "SIZE_UNAVAILABLE"
  | "OUT_OF_STOCK";

export interface VariantRecord {
  id: string;
  name: string;
  isAvailable: boolean;
}

export interface SizeRecord {
  id: string;
  size: string;
  isAvailable: boolean;
}

export interface ProductRecord {
  id: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  controlStock: boolean;
  hasSizes: boolean;
  hasVariants: boolean;
  drop: { name: string; status: string };
  variants: readonly VariantRecord[];
  sizes: readonly SizeRecord[];
}

export interface BundleComponentRecord {
  componentProductId: string;
  /** Units of the component inside one unit of the bundle. */
  quantity: number;
}

export interface CatalogueProduct extends ProductRecord {
  isBundle: boolean;
  components: readonly BundleComponentRecord[];
}

export interface StockRecord {
  stockKey: string;
  onHand: number;
  reserved: number;
  isAvailable: boolean;
}

export interface Catalogue {
  products: ReadonlyMap<string, CatalogueProduct>;
  stock: ReadonlyMap<string, StockRecord>;
}

export interface ComponentSelectionInput {
  componentProductId: string;
  variantId?: string;
  sizeId?: string;
}

export interface OrderLineInput {
  productId?: string;
  variantId?: string;
  sizeId?: string;
  quantity: number;
  components?: readonly ComponentSelectionInput[];
}

export interface ResolvedComponent {
  product: ProductRecord;
  variant: VariantRecord | null;
  size: SizeRecord | null;
  /** Units per bundle unit. */
  quantity: number;
}

export interface ResolvedLine {
  product: ProductRecord;
  variant: VariantRecord | null;
  size: SizeRecord | null;
  quantity: number;
  components: readonly ResolvedComponent[];
}

export type ResolveResult =
  { ok: true; lines: ResolvedLine[] } | { ok: false; error: string };

/** Identifies what failed, for logging and for the customer message. */
export interface FailureSubject {
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  sizeId: string | null;
  sizeLabel: string | null;
  /** Name of the bundle when the failing product is one of its components. */
  bundleName: string | null;
}

export interface AvailabilityFailure extends FailureSubject {
  reason: AvailabilityReason;
}

export interface DemandContribution {
  quantity: number;
  subject: FailureSubject;
}

export interface StockDemand {
  stockKey: string;
  quantity: number;
  contributions: DemandContribution[];
}

export interface OrderItemComponentSnapshot {
  productId: string;
  productName: string;
  variantName: string | null;
  sizeLabel: string | null;
  quantity: number;
}

export interface OrderItemSnapshot {
  productId: string;
  productName: string;
  dropName: string;
  variantName: string | null;
  sizeLabel: string | null;
  unitPriceCents: number;
  quantity: number;
  components: OrderItemComponentSnapshot[];
}

const PRODUCT_NOT_FOUND_MESSAGE =
  "Um ou mais produtos selecionados não foram encontrados.";

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

// A dimension is active only when the flag is on and rows exist. When active,
// a valid selection is required (same rule as the storefront).
function usesVariants(product: ProductRecord): boolean {
  return product.hasVariants && product.variants.length > 0;
}

function usesSizes(product: ProductRecord): boolean {
  return product.hasSizes && product.sizes.length > 0;
}

function findVariantOwner(
  catalogue: Catalogue,
  variantId: string,
): CatalogueProduct | undefined {
  for (const product of catalogue.products.values()) {
    if (product.variants.some((variant) => variant.id === variantId)) {
      return product;
    }
  }
  return undefined;
}

type OptionPick<T> =
  | { ok: true; option: T | null }
  | { ok: false; problem: "INVALID" | "MISSING" };

function pickOption<T extends { id: string }>(
  options: readonly T[],
  id: string | undefined,
  required: boolean,
): OptionPick<T> {
  if (id) {
    const option = required
      ? options.find((candidate) => candidate.id === id)
      : undefined;
    return option ? { ok: true, option } : { ok: false, problem: "INVALID" };
  }
  return required
    ? { ok: false, problem: "MISSING" }
    : { ok: true, option: null };
}

function resolveBundleComponents(
  bundle: CatalogueProduct,
  selections: readonly ComponentSelectionInput[],
  catalogue: Catalogue,
):
  { ok: true; components: ResolvedComponent[] } | { ok: false; error: string } {
  const expectedIds = new Set(
    bundle.components.map((component) => component.componentProductId),
  );
  const selectionById = new Map<string, ComponentSelectionInput>();

  for (const selection of selections) {
    if (!expectedIds.has(selection.componentProductId)) {
      return fail(`O produto informado não faz parte do kit "${bundle.name}".`);
    }
    if (selectionById.has(selection.componentProductId)) {
      return fail(
        `Cada produto do kit "${bundle.name}" deve ser informado uma única vez.`,
      );
    }
    selectionById.set(selection.componentProductId, selection);
  }

  if (selectionById.size !== expectedIds.size) {
    return fail(
      `Selecione as opções de todos os produtos do kit "${bundle.name}".`,
    );
  }

  const components: ResolvedComponent[] = [];
  for (const entry of bundle.components) {
    const product = catalogue.products.get(entry.componentProductId);
    const selection = selectionById.get(entry.componentProductId);
    if (!product || !selection) return fail(PRODUCT_NOT_FOUND_MESSAGE);

    const variant = pickOption(
      product.variants,
      selection.variantId,
      usesVariants(product),
    );
    if (!variant.ok) {
      return fail(
        variant.problem === "MISSING"
          ? `Selecione a variação de "${product.name}" no kit "${bundle.name}".`
          : `A variação selecionada não pertence ao produto "${product.name}" do kit "${bundle.name}".`,
      );
    }

    const size = pickOption(
      product.sizes,
      selection.sizeId,
      usesSizes(product),
    );
    if (!size.ok) {
      return fail(
        size.problem === "MISSING"
          ? `Selecione o tamanho de "${product.name}" no kit "${bundle.name}".`
          : `O tamanho selecionado não pertence ao produto "${product.name}" do kit "${bundle.name}".`,
      );
    }

    components.push({
      product,
      variant: variant.option,
      size: size.option,
      quantity: entry.quantity,
    });
  }

  return { ok: true, components };
}

/**
 * Turns the submitted lines into resolved lines using only catalogue data:
 * finds each product (through its variant when one is given), validates that
 * the variant belongs to the product and, for bundle lines, requires exactly
 * the bundle's component set with a valid option for each component.
 */
export function resolveOrderLines(
  inputs: readonly OrderLineInput[],
  catalogue: Catalogue,
): ResolveResult {
  const lines: ResolvedLine[] = [];

  for (const input of inputs) {
    const variantOwner = input.variantId
      ? findVariantOwner(catalogue, input.variantId)
      : undefined;
    if (input.variantId && !variantOwner)
      return fail(PRODUCT_NOT_FOUND_MESSAGE);

    if (
      variantOwner &&
      input.productId &&
      input.productId !== variantOwner.id
    ) {
      return fail("A variação selecionada não pertence ao produto informado.");
    }

    const productId = variantOwner ? variantOwner.id : input.productId;
    if (!productId) return fail("Produto do item não especificado.");

    const product = variantOwner ?? catalogue.products.get(productId);
    if (!product) return fail(PRODUCT_NOT_FOUND_MESSAGE);

    const variant = input.variantId
      ? (product.variants.find(
          (candidate) => candidate.id === input.variantId,
        ) ?? null)
      : null;
    const size = input.sizeId
      ? (product.sizes.find((candidate) => candidate.id === input.sizeId) ??
        null)
      : null;

    const selections = input.components ?? [];
    let components: readonly ResolvedComponent[] = [];
    if (product.isBundle) {
      const resolved = resolveBundleComponents(product, selections, catalogue);
      if (!resolved.ok) return resolved;
      components = resolved.components;
    } else if (selections.length > 0) {
      return fail(
        `O produto "${product.name}" não é um kit e não aceita seleção de componentes.`,
      );
    }

    lines.push({
      product,
      variant,
      size,
      quantity: input.quantity,
      components,
    });
  }

  return { ok: true, lines };
}

function subjectOf(
  product: ProductRecord,
  variant: VariantRecord | null,
  size: SizeRecord | null,
  bundleName: string | null,
): FailureSubject {
  return {
    productId: product.id,
    productName: product.name,
    variantId: variant?.id ?? null,
    variantName: variant?.name ?? null,
    sizeId: size?.id ?? null,
    sizeLabel: size?.size ?? null,
    bundleName,
  };
}

function stockKeyFor(
  product: ProductRecord,
  variant: VariantRecord | null,
  size: SizeRecord | null,
): string {
  return buildStockKey(
    product.id,
    usesVariants(product) ? variant?.id : null,
    usesSizes(product) ? size?.id : null,
  );
}

/**
 * Stock demand per stock key across every line and every bundle component.
 * Only products that control stock produce demand. Each entry keeps its
 * contributions in cart order so a failure can name the contributor that
 * exhausted the stock.
 */
export function aggregateStockDemand(
  lines: readonly ResolvedLine[],
): StockDemand[] {
  const demandByKey = new Map<string, StockDemand>();

  const addDemand = (
    product: ProductRecord,
    variant: VariantRecord | null,
    size: SizeRecord | null,
    quantity: number,
    bundleName: string | null,
  ) => {
    if (!product.controlStock) return;
    const stockKey = stockKeyFor(product, variant, size);
    let demand = demandByKey.get(stockKey);
    if (!demand) {
      demand = { stockKey, quantity: 0, contributions: [] };
      demandByKey.set(stockKey, demand);
    }
    demand.quantity += quantity;
    demand.contributions.push({
      quantity,
      subject: subjectOf(product, variant, size, bundleName),
    });
  };

  for (const line of lines) {
    addDemand(line.product, line.variant, line.size, line.quantity, null);
    for (const component of line.components) {
      addDemand(
        component.product,
        component.variant,
        component.size,
        component.quantity * line.quantity,
        line.product.name,
      );
    }
  }

  return [...demandByKey.values()];
}

function checkSelection(
  product: ProductRecord,
  variant: VariantRecord | null,
  size: SizeRecord | null,
  requireOpenListing: boolean,
): AvailabilityReason | null {
  if (product.drop.status !== "ACTIVE") return "DROP_ENDED";
  if (requireOpenListing && !product.isAvailable) return "PRODUCT_UNAVAILABLE";
  if (usesVariants(product) && (!variant || !variant.isAvailable)) {
    return "VARIANT_UNAVAILABLE";
  }
  if (usesSizes(product) && (!size || !size.isAvailable)) {
    return "SIZE_UNAVAILABLE";
  }
  return null;
}

function checkStockDemand(
  demands: readonly StockDemand[],
  stock: ReadonlyMap<string, StockRecord>,
): AvailabilityFailure | null {
  for (const demand of demands) {
    const row = stock.get(demand.stockKey);
    if (!row || !row.isAvailable) {
      return { reason: "OUT_OF_STOCK", ...demand.contributions[0].subject };
    }

    const available = row.onHand - row.reserved;
    let requested = 0;
    for (const contribution of demand.contributions) {
      requested += contribution.quantity;
      if (requested > available) {
        return { reason: "OUT_OF_STOCK", ...contribution.subject };
      }
    }
  }
  return null;
}

/**
 * Evaluates every resolved line in one pass: drop status, listing flag, option
 * flags and manual unavailability first, then the aggregated stock demand
 * against `onHand - reserved`. Returns the first failure or null.
 *
 * A component product's own listing flag is not considered: a bundle listing
 * is opened and closed independently of its components.
 */
export function evaluateAvailability(
  lines: readonly ResolvedLine[],
  stock: ReadonlyMap<string, StockRecord>,
): AvailabilityFailure | null {
  for (const line of lines) {
    const reason = checkSelection(line.product, line.variant, line.size, true);
    if (reason) {
      return {
        reason,
        ...subjectOf(line.product, line.variant, line.size, null),
      };
    }

    for (const component of line.components) {
      const componentReason = checkSelection(
        component.product,
        component.variant,
        component.size,
        false,
      );
      if (componentReason) {
        return {
          reason: componentReason,
          ...subjectOf(
            component.product,
            component.variant,
            component.size,
            line.product.name,
          ),
        };
      }
    }
  }

  return checkStockDemand(aggregateStockDemand(lines), stock);
}

/**
 * Totals and persisted snapshot. Prices always come from the catalogue; a
 * bundle line is priced with the bundle product's price.
 */
export function buildOrderSnapshots(lines: readonly ResolvedLine[]): {
  totalPriceCents: number;
  items: OrderItemSnapshot[];
} {
  let totalPriceCents = 0;
  const items: OrderItemSnapshot[] = [];

  for (const line of lines) {
    totalPriceCents += line.product.priceCents * line.quantity;
    items.push({
      productId: line.product.id,
      productName: line.product.name,
      dropName: line.product.drop.name,
      variantName: line.variant ? line.variant.name : null,
      sizeLabel: line.size ? line.size.size : null,
      unitPriceCents: line.product.priceCents,
      quantity: line.quantity,
      components: line.components.map((component) => ({
        productId: component.product.id,
        productName: component.product.name,
        variantName: component.variant ? component.variant.name : null,
        sizeLabel: component.size ? component.size.size : null,
        quantity: component.quantity,
      })),
    });
  }

  return { totalPriceCents, items };
}
