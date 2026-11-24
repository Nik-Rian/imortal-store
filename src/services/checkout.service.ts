import type {
  BundleComponentRecord,
  Catalogue,
  CatalogueProduct,
  ProductRecord,
  StockRecord,
} from "@/lib/order-lines";
import { prisma } from "@/lib/prisma";

export interface CatalogueRequestLine {
  productId?: string;
  variantId?: string;
}

type ProductRow = ProductRecord & { isBundle: boolean };

function unique(values: (string | undefined)[]): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function toCatalogueProduct(
  row: ProductRow,
  components: BundleComponentRecord[],
): CatalogueProduct {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.priceCents,
    isAvailable: row.isAvailable,
    controlStock: row.controlStock,
    hasSizes: row.hasSizes,
    hasVariants: row.hasVariants,
    isBundle: row.isBundle,
    drop: { name: row.drop.name, status: row.drop.status },
    variants: row.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      isAvailable: variant.isAvailable,
    })),
    sizes: row.sizes.map((size) => ({
      id: size.id,
      size: size.size,
      isAvailable: size.isAvailable,
    })),
    components,
  };
}

/**
 * Loads everything needed to price and validate a cart with a fixed number of
 * queries, whatever the number of lines: one for the products (with drop,
 * options and bundle components together with their products) and at most one
 * for the stock rows. A line that carries a variant is requested through the
 * variant alone, so the resolver can detect a variant that does not belong to
 * the informed product.
 */
export async function loadCheckoutCatalogue(
  lines: readonly CatalogueRequestLine[],
): Promise<Catalogue> {
  const variantIds = unique(lines.map((line) => line.variantId));
  const productIds = unique(
    lines.filter((line) => !line.variantId).map((line) => line.productId),
  );

  const rows = await prisma.product.findMany({
    where: {
      OR: [
        { id: { in: productIds } },
        { variants: { some: { id: { in: variantIds } } } },
      ],
    },
    include: {
      drop: true,
      variants: true,
      sizes: true,
      components: {
        orderBy: { componentProduct: { name: "asc" } },
        select: {
          componentProductId: true,
          quantity: true,
          componentProduct: {
            include: { drop: true, variants: true, sizes: true },
          },
        },
      },
    },
  });

  const products = new Map<string, CatalogueProduct>();
  for (const row of rows) {
    products.set(
      row.id,
      toCatalogueProduct(
        row,
        row.components.map((component) => ({
          componentProductId: component.componentProductId,
          quantity: component.quantity,
        })),
      ),
    );
  }
  for (const row of rows) {
    for (const component of row.components) {
      if (!products.has(component.componentProduct.id)) {
        products.set(
          component.componentProduct.id,
          toCatalogueProduct(component.componentProduct, []),
        );
      }
    }
  }

  const stockProductIds = [...products.values()]
    .filter((product) => product.controlStock)
    .map((product) => product.id);

  const stockRows =
    stockProductIds.length > 0
      ? await prisma.stockItem.findMany({
          where: { productId: { in: stockProductIds } },
          select: {
            stockKey: true,
            onHand: true,
            reserved: true,
            isAvailable: true,
          },
        })
      : [];

  const stock = new Map<string, StockRecord>(
    stockRows.map((stockRow) => [stockRow.stockKey, stockRow] as const),
  );

  return { products, stock };
}
